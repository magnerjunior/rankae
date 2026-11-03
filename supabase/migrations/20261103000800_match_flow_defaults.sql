begin;

create type public.player_membership as enum ('regular', 'guest');
alter table public.players add column membership_status public.player_membership not null default 'regular';

update public.sessions s
set rules_snapshot = jsonb_set(
  jsonb_set(coalesce(s.rules_snapshot, '{}'::jsonb), '{regulationDurationMs}', '420000'::jsonb, true),
  '{overtimeDurationMs}', '180000'::jsonb, true
), updated_at = now()
where coalesce((s.rules_snapshot ->> 'regulationDurationMs')::integer, 600000) = 600000
  and not exists (
    select 1 from public.audit_logs a
    where a.session_id = s.id and a.action = 'update_rules'
  );

update public.matches
set regulation_duration_ms = 420000,
    overtime_duration_ms = 180000,
    duration_limit_ms = case when clock_phase = 'regulation' then 420000 else 180000 end,
    updated_at = now()
where state = 'ready' and regulation_duration_ms = 600000;

create or replace function public.create_additional_ranka(
  p_org_id uuid,
  p_ranka_name text,
  p_ranka_slug text,
  p_scheduled_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  owner_member public.organization_members%rowtype;
  created_ranka public.rankas%rowtype;
  created_session public.sessions%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(actor_id::text));
  if not exists (select 1 from public.organizations where id = p_org_id and owner_user_id = actor_id) then
    raise exception 'Only the organization owner can create a ranka' using errcode = '42501';
  end if;
  if (select count(*) from public.rankas r join public.organizations o on o.id = r.org_id where o.owner_user_id = actor_id) >= 3 then
    raise exception 'Ranka limit reached' using errcode = '23514';
  end if;
  if char_length(trim(p_ranka_name)) < 2 or p_ranka_slug <> lower(p_ranka_slug) or p_ranka_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid ranka data' using errcode = '22023';
  end if;
  select * into owner_member from public.organization_members
  where org_id = p_org_id and user_id = actor_id and active and role = 'owner';
  insert into public.rankas (org_id, slug, name) values (p_org_id, p_ranka_slug, trim(p_ranka_name)) returning * into created_ranka;
  insert into public.ranka_organizers (ranka_id, member_id, org_id, role) values (created_ranka.id, owner_member.id, p_org_id, 'owner');
  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
  values (created_ranka.id, p_org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    jsonb_build_object('squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0))
  returning * into created_session;
  return jsonb_build_object('ranka_id', created_ranka.id, 'session_id', created_session.id);
end;
$$;

create or replace function public.start_ranka_session(
  p_ranka_id uuid,
  p_scheduled_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
  previous public.sessions%rowtype;
  current_session public.sessions%rowtype;
begin
  select * into target from public.rankas where id = p_ranka_id;
  if target.id is null then raise exception 'Ranka not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(target.id::text));
  select * into current_session from public.sessions where ranka_id = target.id and scheduled_on = p_scheduled_on;
  if current_session.id is not null then return to_jsonb(current_session); end if;
  select * into previous from public.sessions where ranka_id = target.id order by scheduled_on desc limit 1;
  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, contribution_amount_cents, rules_snapshot)
  values (target.id, target.org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    coalesce(previous.contribution_amount_cents, 0),
    coalesce(previous.rules_snapshot, jsonb_build_object(
      'squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0)))
  returning * into current_session;
  return to_jsonb(current_session);
end;
$$;

create function public.update_match_marker(
  p_event_id uuid,
  p_label text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.match_events%rowtype;
  target_match public.matches%rowtype;
  previous_label text;
begin
  if char_length(trim(p_label)) not between 1 and 80 then raise exception 'Invalid marker label' using errcode = '22023'; end if;
  select * into target from public.match_events where id = p_event_id and event_type = 'marker' and status = 'active' for update;
  if target.id is null then raise exception 'Marker not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka((select ranka_id from public.matches where id = target.match_id)) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into target_match from public.matches where id = target.match_id for update;
  if target_match.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target_match.revision::text; end if;
  if exists (select 1 from public.audit_logs where match_id = target.match_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('match_revision', target_match.revision, 'idempotent', true);
  end if;
  previous_label := target.label;
  update public.match_events set label = trim(p_label), version = version + 1 where id = target.id;
  update public.matches set revision = revision + 1, updated_at = now() where id = target.match_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target_match.ranka_id, target.session_id, target.match_id, 'update_marker', 'match_event', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('label', previous_label), jsonb_build_object('label', trim(p_label)));
  return jsonb_build_object('match_revision', target_match.revision + 1, 'label', trim(p_label));
end;
$$;

create function public.set_player_membership(
  p_player_id uuid,
  p_membership public.player_membership,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.players%rowtype;
  previous_membership public.player_membership;
begin
  select * into target from public.players where id = p_player_id for update;
  if target.id is null then raise exception 'Player not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.rankas r where r.org_id = target.org_id and private.can_manage_ranka(r.id)) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.audit_logs where org_id = target.org_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('player_id', target.id, 'membership', target.membership_status, 'idempotent', true);
  end if;
  previous_membership := target.membership_status;
  update public.players set membership_status = p_membership, revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, 'set_player_membership', 'player', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('membership', previous_membership), jsonb_build_object('membership', p_membership));
  return jsonb_build_object('player_id', target.id, 'membership', p_membership);
end;
$$;

revoke all on function public.update_match_marker(uuid, text, bigint, uuid) from public, anon;
grant execute on function public.update_match_marker(uuid, text, bigint, uuid) to authenticated;
revoke all on function public.set_player_membership(uuid, public.player_membership, uuid) from public, anon;
grant execute on function public.set_player_membership(uuid, public.player_membership, uuid) to authenticated;

commit;
