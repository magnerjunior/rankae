begin;

alter table public.players
  add column public_visible boolean not null default false,
  add column public_display_name text,
  add constraint players_public_display_name_check check (
    public_display_name is null or char_length(trim(public_display_name)) between 2 and 80
  );

create table public.portal_access_grants (
  id uuid primary key default gen_random_uuid(),
  ranka_id uuid not null references public.rankas(id) on delete cascade,
  grant_hash text not null unique,
  scope text not null check (scope in ('unlisted', 'pin_protected')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index portal_access_grants_lookup_idx
  on public.portal_access_grants(ranka_id, grant_hash, expires_at)
  where revoked_at is null;

create table public.portal_access_attempts (
  id bigint generated always as identity primary key,
  ranka_id uuid not null references public.rankas(id) on delete cascade,
  fingerprint_hash text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);

create index portal_access_attempts_rate_idx
  on public.portal_access_attempts(ranka_id, fingerprint_hash, attempted_at desc)
  where not succeeded;

create function private.hash_portal_secret(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(value, 'sha256'), 'hex');
$$;

create function private.public_player_name(target public.players)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when target.status = 'active' and target.public_visible
      then coalesce(nullif(trim(target.public_display_name), ''), nullif(trim(target.nickname), ''), split_part(trim(target.full_name), ' ', 1))
    else null
  end;
$$;

create function private.portal_grant_valid(target_ranka_id uuid, raw_grant text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select raw_grant is not null and exists (
    select 1
    from public.portal_access_grants grant_row
    where grant_row.ranka_id = target_ranka_id
      and grant_row.grant_hash = private.hash_portal_secret(raw_grant)
      and grant_row.revoked_at is null
      and grant_row.expires_at > clock_timestamp()
  );
$$;

create function public.configure_public_portal(
  p_ranka_id uuid,
  p_visibility public.ranka_visibility,
  p_pin text default null,
  p_link_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
begin
  select * into target from public.rankas where id = p_ranka_id for update;
  if target.id is null then raise exception 'Ranka not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.id) then raise exception 'Forbidden' using errcode = '42501'; end if;

  if p_visibility = 'unlisted' and (p_link_token is null or char_length(p_link_token) < 32) then
    raise exception 'A strong link token is required' using errcode = '22023';
  end if;
  if p_visibility = 'pin_protected' and (p_pin is null or p_pin !~ '^\d{4}$') then
    raise exception 'A four digit PIN is required' using errcode = '22023';
  end if;
  if p_visibility = 'pin_protected' and (p_link_token is null or char_length(p_link_token) < 32) then
    raise exception 'A strong link token is required with the PIN' using errcode = '22023';
  end if;

  update public.rankas
  set visibility = p_visibility,
      invite_token_hash = case
        when p_visibility in ('unlisted', 'pin_protected') then private.hash_portal_secret(p_link_token)
        else null
      end,
      pin_hash = case
        when p_visibility = 'pin_protected' then extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
        else null
      end,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = target.id;

  update public.portal_access_grants
  set revoked_at = clock_timestamp()
  where ranka_id = target.id and revoked_at is null;

  return jsonb_build_object(
    'slug', target.slug,
    'visibility', p_visibility,
    'link_required', p_visibility in ('unlisted', 'pin_protected'),
    'pin_required', p_visibility = 'pin_protected'
  );
end;
$$;

create function public.set_player_public_profile(
  p_player_id uuid,
  p_visible boolean,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.players%rowtype;
begin
  select * into target from public.players where id = p_player_id for update;
  if target.id is null then raise exception 'Player not found' using errcode = 'P0002'; end if;
  if not private.can_manage_org(target.org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_visible and char_length(trim(coalesce(p_display_name, target.nickname, split_part(target.full_name, ' ', 1)))) < 2 then
    raise exception 'A public display name is required' using errcode = '22023';
  end if;
  update public.players
  set public_visible = p_visible,
      public_display_name = case when p_visible then nullif(trim(p_display_name), '') else null end,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = target.id;
  return jsonb_build_object('player_id', target.id, 'public_visible', p_visible);
end;
$$;

create function public.get_public_portal_gate(p_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare target public.rankas%rowtype;
begin
  select * into target from public.rankas where slug = lower(trim(p_slug));
  if target.id is null or target.visibility = 'private_off' then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if target.visibility = 'public' then
    return jsonb_build_object('status', 'open', 'ranka_name', target.name, 'link_required', false);
  end if;
  if target.visibility = 'unlisted' then
    return jsonb_build_object('status', 'link_required', 'link_required', true);
  end if;
  return jsonb_build_object(
    'status', 'pin_required',
    'ranka_name', target.name,
    'link_required', target.invite_token_hash is not null,
    'warning', 'PIN curto e link compartilhado são barreiras leves; não garantem sigilo forte.'
  );
end;
$$;

create function public.exchange_public_portal_access(
  p_slug text,
  p_link_token text,
  p_pin text,
  p_grant_token text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
  fingerprint_hash text;
  recent_failures integer;
  allowed boolean := false;
  grant_expiry timestamptz := clock_timestamp() + interval '2 hours';
begin
  if p_grant_token is null or char_length(p_grant_token) < 32 or p_fingerprint is null then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;
  select * into target from public.rankas where slug = lower(trim(p_slug));
  if target.id is null or target.visibility = 'private_off' then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;
  if target.visibility = 'public' then
    return jsonb_build_object('authorized', true, 'status', 'public');
  end if;

  fingerprint_hash := private.hash_portal_secret(target.id::text || ':' || p_fingerprint);
  select count(*) into recent_failures
  from public.portal_access_attempts attempt
  where attempt.ranka_id = target.id
    and attempt.fingerprint_hash = fingerprint_hash
    and not attempt.succeeded
    and attempt.attempted_at > clock_timestamp() - interval '15 minutes';

  if recent_failures >= 5 then
    return jsonb_build_object('authorized', false, 'status', 'locked', 'retry_after_seconds', 900);
  end if;

  allowed := target.invite_token_hash is not null
    and p_link_token is not null
    and private.hash_portal_secret(p_link_token) = target.invite_token_hash;
  if target.visibility = 'pin_protected' then
    allowed := allowed and p_pin is not null and target.pin_hash is not null
      and extensions.crypt(p_pin, target.pin_hash) = target.pin_hash;
  end if;

  insert into public.portal_access_attempts(ranka_id, fingerprint_hash, succeeded)
  values (target.id, fingerprint_hash, allowed);

  if not allowed then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;

  delete from public.portal_access_grants
  where ranka_id = target.id and expires_at < clock_timestamp() - interval '1 day';
  insert into public.portal_access_grants(ranka_id, grant_hash, scope, expires_at)
  values (target.id, private.hash_portal_secret(p_grant_token), target.visibility::text, grant_expiry);
  return jsonb_build_object('authorized', true, 'status', 'granted', 'expires_at', grant_expiry);
end;
$$;

create function public.get_public_ranka_snapshot(
  p_slug text,
  p_grant_token text default null,
  p_period text default 'last',
  p_specific_date date default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target_ranka public.rankas%rowtype;
  target_session public.sessions%rowtype;
  target_match public.matches%rowtype;
  local_today date;
  period_start date;
  period_end date;
  period_year integer;
  period_label text;
  snapshot jsonb;
begin
  if p_period not in ('last', 'month', 'season', 'day') then p_period := 'last'; end if;
  select * into target_ranka from public.rankas where slug = lower(trim(p_slug));
  if target_ranka.id is null then return null; end if;
  if not private.can_manage_ranka(target_ranka.id)
    and target_ranka.visibility <> 'public'
    and not private.portal_grant_valid(target_ranka.id, p_grant_token) then
    return null;
  end if;
  if target_ranka.visibility = 'private_off' and not private.can_manage_ranka(target_ranka.id) then return null; end if;

  select * into target_session
  from public.sessions where ranka_id = target_ranka.id
  order by scheduled_on desc, created_at desc limit 1;

  if target_session.id is not null then
    select * into target_match
    from public.matches
    where session_id = target_session.id and state <> 'cancelled'
    order by case when state <> 'completed' then 0 else 1 end, ordinal desc
    limit 1;
  end if;

  local_today := (clock_timestamp() at time zone target_ranka.timezone)::date;
  if p_period = 'last' then
    select scheduled_on into period_start from public.sessions
    where ranka_id = target_ranka.id and state = 'completed'
    order by scheduled_on desc limit 1;
    period_start := coalesce(period_start, target_session.scheduled_on, local_today);
    period_end := period_start + 1;
    period_label := 'Último ranka';
  elsif p_period = 'month' then
    period_start := date_trunc('month', local_today)::date;
    period_end := (period_start + interval '1 month')::date;
    period_label := 'Este mês';
  elsif p_period = 'season' then
    period_year := extract(year from local_today)::integer;
    period_label := 'Temporada ' || period_year::text;
  else
    if p_specific_date is null then return null; end if;
    period_start := p_specific_date;
    period_end := p_specific_date + 1;
    period_label := to_char(p_specific_date, 'DD/MM/YYYY');
  end if;

  with filtered_sessions as (
    select s.id, s.scheduled_on
    from public.sessions s
    where s.ranka_id = target_ranka.id
      and ((p_period = 'season' and s.season_year = period_year)
        or (p_period <> 'season' and s.scheduled_on >= period_start and s.scheduled_on < period_end))
  ), completed_matches as (
    select m.*, fs.scheduled_on,
      (select al.after_data ->> 'result' from public.audit_logs al
       where al.match_id = m.id and al.action = 'complete_and_rotate'
       order by al.created_at desc limit 1) as result_value,
      (select count(*) from public.match_events e where e.match_id = m.id and e.status = 'active' and e.side = 'yellow' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::integer as yellow_score,
      (select count(*) from public.match_events e where e.match_id = m.id and e.status = 'active' and e.side = 'red' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::integer as red_score
    from public.matches m join filtered_sessions fs on fs.id = m.session_id
    where m.state = 'completed'
  ), participants as (
    select distinct cm.id as match_id, cm.yellow_squad_id, cm.red_squad_id, cm.result_value,
      ma.player_id, ma.squad_id
    from completed_matches cm
    join public.match_assignments ma on ma.match_id = cm.id and ma.status <> 'cancelled' and ma.role <> 'ball_boy'
  ), player_stats as (
    select p.id, private.public_player_name(p) as display_name,
      count(distinct part.match_id)::integer as matches,
      count(distinct part.match_id) filter (where (part.result_value = 'yellow' and part.squad_id = part.yellow_squad_id) or (part.result_value = 'red' and part.squad_id = part.red_squad_id))::integer as wins,
      count(distinct part.match_id) filter (where (part.result_value = 'yellow' and part.squad_id = part.red_squad_id) or (part.result_value = 'red' and part.squad_id = part.yellow_squad_id))::integer as losses,
      count(distinct part.match_id) filter (where part.result_value = 'both_out')::integer as draws,
      count(e.id) filter (where e.event_type = 'goal' and e.status = 'active' and e.scorer_player_id = p.id and e.goal_kind <> 'own_goal')::integer as goals,
      count(e.id) filter (where e.event_type = 'goal' and e.status = 'active' and e.assist_player_id = p.id)::integer as assists,
      count(e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id)::integer as penalties_taken,
      count(e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id and e.penalty_outcome = 'converted')::integer as penalties_converted,
      count(e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id and e.penalty_outcome in ('missed', 'saved'))::integer as penalties_missed,
      count(e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.keeper_player_id = p.id and e.penalty_outcome = 'saved')::integer as penalties_saved
    from participants part
    join public.players p on p.id = part.player_id
    left join public.match_events e on e.match_id = part.match_id
    where private.public_player_name(p) is not null
    group by p.id, private.public_player_name(p)
  )
  select jsonb_build_object(
    'rankaName', target_ranka.name,
    'slug', target_ranka.slug,
    'sessionDate', target_session.scheduled_on,
    'liveMatch', case when target_match.id is null then null else jsonb_build_object(
      'ordinal', target_match.ordinal,
      'state', target_match.state,
      'clockPhase', target_match.clock_phase,
      'startedAtServer', target_match.started_at_server,
      'elapsedMsBeforeStart', target_match.elapsed_ms_before_start,
      'durationLimitMs', target_match.duration_limit_ms,
      'yellow', jsonb_build_object(
        'number', (select squad_number from public.squads where id = target_match.yellow_squad_id),
        'score', (select count(*) from public.match_events e where e.match_id = target_match.id and e.status = 'active' and e.side = 'yellow' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted'))),
        'players', coalesce((select jsonb_agg(name order by position) from (
          select coalesce(private.public_player_name(p), 'Participante ' || (row_number() over (order by ma.created_at, ma.id))::text) as name,
            row_number() over (order by ma.created_at, ma.id) as position
          from public.match_assignments ma join public.players p on p.id = ma.player_id
          where ma.match_id = target_match.id and ma.field_side = 'yellow' and ma.role in ('line', 'keeper', 'borrowed_keeper') and ma.status <> 'cancelled' and ma.end_ms is null
        ) yellow_players), '[]'::jsonb)
      ),
      'red', jsonb_build_object(
        'number', (select squad_number from public.squads where id = target_match.red_squad_id),
        'score', (select count(*) from public.match_events e where e.match_id = target_match.id and e.status = 'active' and e.side = 'red' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted'))),
        'players', coalesce((select jsonb_agg(name order by position) from (
          select coalesce(private.public_player_name(p), 'Participante ' || (row_number() over (order by ma.created_at, ma.id))::text) as name,
            row_number() over (order by ma.created_at, ma.id) as position
          from public.match_assignments ma join public.players p on p.id = ma.player_id
          where ma.match_id = target_match.id and ma.field_side = 'red' and ma.role in ('line', 'keeper', 'borrowed_keeper') and ma.status <> 'cancelled' and ma.end_ms is null
        ) red_players), '[]'::jsonb)
      ),
      'keepers', jsonb_build_object(
        'yellow', (select private.public_player_name(p) from public.match_assignments ma join public.players p on p.id = ma.player_id where ma.match_id = target_match.id and ma.field_side = 'yellow' and ma.role in ('keeper','borrowed_keeper') and ma.status <> 'cancelled' limit 1),
        'red', (select private.public_player_name(p) from public.match_assignments ma join public.players p on p.id = ma.player_id where ma.match_id = target_match.id and ma.field_side = 'red' and ma.role in ('keeper','borrowed_keeper') and ma.status <> 'cancelled' limit 1)
      ),
      'ballBoys', coalesce((select jsonb_agg(coalesce(private.public_player_name(p), 'Apoio reservado')) from public.match_assignments ma join public.players p on p.id = ma.player_id where ma.match_id = target_match.id and ma.role = 'ball_boy' and ma.status <> 'cancelled'), '[]'::jsonb)
    ) end,
    'nextSquads', coalesce((select jsonb_agg(squad_payload order by queue_position) from (
      select s.queue_position, jsonb_build_object(
        'number', s.squad_number,
        'players', coalesce((select jsonb_agg(coalesce(private.public_player_name(p), 'Participante ' || sm.assignment_order::text) order by sm.assignment_order)
          from public.squad_members sm join public.players p on p.id = sm.player_id where sm.squad_id = s.id and sm.removed_at is null), '[]'::jsonb)
      ) as squad_payload
      from public.squads s
      where s.session_id = target_session.id
        and (target_match.id is null or s.id not in (target_match.yellow_squad_id, target_match.red_squad_id))
        and s.state in ('waiting','resting')
      order by s.queue_position limit 2
    ) waiting), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(result_payload order by scheduled_on desc, ordinal desc) from (
      select cm.scheduled_on, cm.ordinal, jsonb_build_object(
        'date', cm.scheduled_on,
        'ordinal', cm.ordinal,
        'yellowSquadNumber', ys.squad_number,
        'redSquadNumber', rs.squad_number,
        'yellowScore', cm.yellow_score,
        'redScore', cm.red_score
      ) as result_payload
      from completed_matches cm
      join public.squads ys on ys.id = cm.yellow_squad_id
      join public.squads rs on rs.id = cm.red_squad_id
      order by cm.scheduled_on desc, cm.ordinal desc limit 20
    ) result_rows), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(jsonb_build_object(
      'name', display_name,
      'goals', goals,
      'assists', assists,
      'penaltiesTaken', penalties_taken,
      'penaltiesConverted', penalties_converted,
      'penaltiesMissed', penalties_missed,
      'penaltiesSaved', penalties_saved,
      'matches', matches,
      'wins', wins,
      'losses', losses,
      'draws', draws
    ) order by goals desc, assists desc, display_name) from player_stats), '[]'::jsonb),
    'period', p_period,
    'periodLabel', period_label,
    'snapshotVersion', greatest(coalesce(target_session.revision, 0), coalesce(target_match.revision, 0)),
    'asOfServer', clock_timestamp()
  ) into snapshot;
  return snapshot;
end;
$$;

create function private.broadcast_public_portal_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_session_id uuid;
  target_slug text;
  target_visibility public.ranka_visibility;
begin
  target_session_id := case when tg_table_name = 'sessions' then (payload ->> 'id')::uuid else (payload ->> 'session_id')::uuid end;
  select r.slug, r.visibility into target_slug, target_visibility
  from public.sessions s join public.rankas r on r.id = s.ranka_id
  where s.id = target_session_id;
  if target_slug is not null and target_visibility <> 'private_off' then
    perform realtime.send(
      jsonb_build_object('version', floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
      'refresh',
      'portal:' || target_slug,
      false
    );
  end if;
  return null;
end;
$$;

create trigger sessions_public_portal_refresh after update on public.sessions for each row execute function private.broadcast_public_portal_refresh();
create trigger squads_public_portal_refresh after insert or update or delete on public.squads for each row execute function private.broadcast_public_portal_refresh();
create trigger squad_members_public_portal_refresh after insert or update or delete on public.squad_members for each row execute function private.broadcast_public_portal_refresh();
create trigger matches_public_portal_refresh after insert or update or delete on public.matches for each row execute function private.broadcast_public_portal_refresh();
create trigger match_assignments_public_portal_refresh after insert or update or delete on public.match_assignments for each row execute function private.broadcast_public_portal_refresh();
create trigger match_events_public_portal_refresh after insert or update or delete on public.match_events for each row execute function private.broadcast_public_portal_refresh();

alter table public.portal_access_grants enable row level security;
alter table public.portal_access_attempts enable row level security;
revoke all on public.portal_access_grants, public.portal_access_attempts from public, anon, authenticated;

revoke all on function private.hash_portal_secret(text) from public, anon, authenticated;
revoke all on function private.public_player_name(public.players) from public, anon, authenticated;
revoke all on function private.portal_grant_valid(uuid, text) from public, anon, authenticated;
revoke all on function private.broadcast_public_portal_refresh() from public, anon, authenticated;

revoke all on function public.configure_public_portal(uuid, public.ranka_visibility, text, text) from public, anon;
revoke all on function public.set_player_public_profile(uuid, boolean, text) from public, anon;
grant execute on function public.configure_public_portal(uuid, public.ranka_visibility, text, text) to authenticated;
grant execute on function public.set_player_public_profile(uuid, boolean, text) to authenticated;

revoke all on function public.get_public_portal_gate(text) from public;
revoke all on function public.exchange_public_portal_access(text, text, text, text, text) from public;
revoke all on function public.get_public_ranka_snapshot(text, text, text, date) from public;
grant execute on function public.get_public_portal_gate(text) to anon, authenticated;
grant execute on function public.exchange_public_portal_access(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_public_ranka_snapshot(text, text, text, date) to anon, authenticated;

commit;
