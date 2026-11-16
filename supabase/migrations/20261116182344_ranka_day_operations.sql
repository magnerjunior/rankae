begin;

create function private.rotate_ball_boys_after_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  with helpers as (
    select player_id from public.match_assignments
    where match_id = new.id and role = 'ball_boy' and status <> 'cancelled'
  ), waiting as (
    select distinct sm.squad_id
    from public.squad_members sm join helpers h using (player_id)
    join public.squads s on s.id = sm.squad_id
    where sm.session_id = new.session_id and sm.removed_at is null and s.state = 'waiting'
  ), ordered as (
    select sm.id, row_number() over (
      partition by sm.squad_id order by (h.player_id is not null), sm.assignment_order, sm.id
    )::integer as position
    from public.squad_members sm join waiting w using (squad_id)
    left join helpers h using (player_id)
    where sm.removed_at is null
  )
  update public.squad_members sm set assignment_order = ordered.position
  from ordered where sm.id = ordered.id and sm.assignment_order <> ordered.position;
  return new;
end;
$$;
revoke all on function private.rotate_ball_boys_after_match() from public, anon, authenticated;
create trigger match_ball_boy_rotation after update of state on public.matches
for each row when (old.state <> 'completed' and new.state = 'completed')
execute function private.rotate_ball_boys_after_match();

create function private.keep_session_keeper_waiver() returns trigger
language plpgsql security definer set search_path = '' as $$
declare preference jsonb;
begin
  if tg_op = 'INSERT' then
    select settings_json->'waiveKeeperContributions' into preference from public.rankas where id = new.ranka_id;
  elsif not (new.rules_snapshot ? 'waiveKeeperContributions') then
    preference := old.rules_snapshot->'waiveKeeperContributions';
  end if;
  if jsonb_typeof(preference) = 'boolean' then
    new.rules_snapshot := jsonb_set(new.rules_snapshot, '{waiveKeeperContributions}', preference);
  end if;
  return new;
end;
$$;
revoke all on function private.keep_session_keeper_waiver() from public, anon, authenticated;
create trigger keep_session_keeper_waiver before insert or update of rules_snapshot on public.sessions
for each row execute function private.keep_session_keeper_waiver();

with latest_preference as (
  select distinct on (ranka_id) ranka_id, rules_snapshot->'waiveKeeperContributions' as enabled
  from public.sessions where jsonb_typeof(rules_snapshot->'waiveKeeperContributions') = 'boolean'
  order by ranka_id, scheduled_on desc, created_at desc
)
update public.rankas r set settings_json = jsonb_set(r.settings_json, '{waiveKeeperContributions}', p.enabled),
  revision = r.revision + 1, updated_at = now()
from latest_preference p where p.ranka_id = r.id and not (r.settings_json ? 'waiveKeeperContributions');

create function public.set_ranka_keeper_waiver(p_ranka_id uuid, p_enabled boolean, p_revision bigint, p_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.rankas%rowtype;
  current_day public.sessions%rowtype;
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_enabled is null or p_key is null then raise exception 'Invalid waiver' using errcode = '22023'; end if;
  select * into target from public.rankas where id = p_ranka_id for update;
  insert into private.workspace_command_receipts values (target.id, 'set_ranka_keeper_waiver', p_key) on conflict do nothing;
  if not found then return; end if;
  if target.revision is distinct from p_revision then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
  update public.rankas set settings_json = jsonb_set(settings_json, '{waiveKeeperContributions}', to_jsonb(p_enabled)),
    revision = revision + 1, updated_at = now() where id = target.id;
  select * into current_day from public.sessions
  where ranka_id = target.id and state <> 'completed'
  order by scheduled_on desc, created_at desc limit 1 for update;
  if found then
    perform public.set_session_keeper_waiver(current_day.id, p_enabled, current_day.revision, p_key);
  end if;
end;
$$;
revoke all on function public.set_ranka_keeper_waiver(uuid,boolean,bigint,uuid) from public, anon;
grant execute on function public.set_ranka_keeper_waiver(uuid,boolean,bigint,uuid) to authenticated;

create function public.get_ranka_day_overview(p_ranka_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  zone text;
  week_start date;
  result jsonb;
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select timezone into zone from public.rankas where id = p_ranka_id;
  week_start := date_trunc('week', now() at time zone zone)::date;
  with days as (
    select id, scheduled_on, created_at, state from public.sessions where ranka_id = p_ranka_id
  ), last_day as (
    select id, scheduled_on from days where state = 'completed' order by scheduled_on desc, created_at desc limit 1
  ), games as (
    select m.id, d.id as day_id, d.scheduled_on from days d
    join public.matches m on m.session_id = d.id where m.state = 'completed'
  ), goals as (
    select e.scorer_player_id, e.assist_player_id, e.goal_kind, g.day_id, g.scheduled_on
    from games g join public.match_events e on e.match_id = g.id
    where e.status = 'active' and e.event_type = 'goal'
  ), points as (
    select player_id, count(*) filter (where kind = 'goal') as goals,
      count(*) filter (where kind = 'assist') as assists
    from goals g
    cross join lateral (values (g.scorer_player_id, 'goal'), (g.assist_player_id, 'assist')) p(player_id,kind)
    where g.scheduled_on >= week_start and g.scheduled_on < week_start + 7
      and g.goal_kind is distinct from 'own_goal' and p.player_id is not null
    group by player_id order by count(*) desc, count(*) filter (where kind = 'goal') desc, player_id limit 1
  )
  select jsonb_build_object(
    'matches', (select count(*) from games),
    'goals', (select count(*) from goals),
    'assists', (select count(*) from goals where assist_player_id is not null and goal_kind is distinct from 'own_goal'),
    'lastDay', (select jsonb_build_object('id', d.id, 'date', d.scheduled_on,
      'matches', (select count(*) from games where day_id = d.id),
      'goals', (select count(*) from goals where day_id = d.id),
      'assists', (select count(*) from goals where day_id = d.id and assist_player_id is not null and goal_kind is distinct from 'own_goal'))
      from last_day d),
    'star', (select jsonb_build_object('name', p.full_name, 'goals', points.goals, 'assists', points.assists)
      from points join public.players p on p.id = points.player_id)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_ranka_day_overview(uuid) from public, anon;
grant execute on function public.get_ranka_day_overview(uuid) to authenticated;

commit;
