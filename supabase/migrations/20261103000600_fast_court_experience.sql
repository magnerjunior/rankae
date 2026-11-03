begin;

create function private.enforce_owner_ranka_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_owner uuid;
begin
  select owner_user_id into target_owner from public.organizations where id = new.org_id;
  perform pg_advisory_xact_lock(hashtext(target_owner::text));
  if (select count(*) from public.rankas r join public.organizations o on o.id = r.org_id where o.owner_user_id = target_owner) >= 3 then
    raise exception 'Ranka limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger rankas_owner_limit before insert on public.rankas
for each row execute function private.enforce_owner_ranka_limit();

revoke all on function private.enforce_owner_ranka_limit() from public, anon, authenticated;

create function public.create_additional_ranka(
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
  if not exists (
    select 1 from public.organizations
    where id = p_org_id and owner_user_id = actor_id
  ) then raise exception 'Only the organization owner can create a ranka' using errcode = '42501'; end if;
  if (select count(*) from public.rankas r join public.organizations o on o.id = r.org_id where o.owner_user_id = actor_id) >= 3 then
    raise exception 'Ranka limit reached' using errcode = '23514';
  end if;
  if char_length(trim(p_ranka_name)) < 2 or p_ranka_slug <> lower(p_ranka_slug) or p_ranka_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid ranka data' using errcode = '22023';
  end if;

  select * into owner_member from public.organization_members
  where org_id = p_org_id and user_id = actor_id and active and role = 'owner';

  insert into public.rankas (org_id, slug, name)
  values (p_org_id, p_ranka_slug, trim(p_ranka_name))
  returning * into created_ranka;

  insert into public.ranka_organizers (ranka_id, member_id, org_id, role)
  values (created_ranka.id, owner_member.id, p_org_id, 'owner');

  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
  values (
    created_ranka.id, p_org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    jsonb_build_object('squadSize', 6, 'regulationDurationMs', 600000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0)
  ) returning * into created_session;

  return jsonb_build_object('ranka_id', created_ranka.id, 'session_id', created_session.id);
end;
$$;

create function public.start_ranka_session(
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

  select * into current_session from public.sessions
  where ranka_id = target.id and scheduled_on = p_scheduled_on;
  if current_session.id is not null then return to_jsonb(current_session); end if;

  select * into previous from public.sessions where ranka_id = target.id order by scheduled_on desc limit 1;
  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, contribution_amount_cents, rules_snapshot)
  values (
    target.id, target.org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    coalesce(previous.contribution_amount_cents, 0),
    coalesce(previous.rules_snapshot, jsonb_build_object(
      'squadSize', 6, 'regulationDurationMs', 600000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0
    ))
  ) returning * into current_session;
  return to_jsonb(current_session);
end;
$$;

create function public.add_arrival_by_name(
  p_session_id uuid,
  p_full_name text,
  p_role public.player_role_preference,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  selected_player public.players%rowtype;
  created_arrival public.attendance%rowtype;
  duplicate_count integer;
  next_index integer;
  present_count integer;
  role_count integer;
  role_limit integer;
  total_cost integer;
begin
  if char_length(trim(p_full_name)) < 2 or p_role not in ('line', 'keeper') then
    raise exception 'Name and position are required' using errcode = '22023';
  end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.audit_logs where session_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;

  select count(*) into duplicate_count from public.players
  where org_id = target.org_id and status = 'active' and normalized_name = private.normalize_name(p_full_name);
  if duplicate_count > 1 then raise exception 'Use a more complete name' using errcode = '23505'; end if;
  if duplicate_count = 1 then
    select * into selected_player from public.players
    where org_id = target.org_id and status = 'active' and normalized_name = private.normalize_name(p_full_name)
    limit 1;
  else
    insert into public.players (org_id, full_name, role_preference)
    values (target.org_id, trim(p_full_name), p_role) returning * into selected_player;
  end if;

  if exists (select 1 from public.attendance where session_id = target.id and player_id = selected_player.id and status = 'present') then
    return jsonb_build_object('player_id', selected_player.id, 'session_revision', target.revision, 'already_present', true);
  end if;

  role_limit := case when p_role = 'keeper'
    then coalesce((target.rules_snapshot ->> 'maxKeepers')::integer, 3)
    else coalesce((target.rules_snapshot ->> 'maxLinePlayers')::integer, 24) end;
  select count(*) into role_count from public.attendance
  where session_id = target.id and status = 'present' and role_preference = p_role;
  if role_count >= role_limit then raise exception 'Position limit reached' using errcode = '23514'; end if;

  select coalesce(max(arrival_index), 0) + 1 into next_index from public.attendance where session_id = target.id;
  insert into public.attendance (session_id, org_id, player_id, arrival_index, role_preference, idempotency_key, created_by)
  values (target.id, target.org_id, selected_player.id, next_index, p_role, p_idempotency_key, (select auth.uid()))
  on conflict (session_id, player_id) do update set status = 'present', role_preference = excluded.role_preference, revision = attendance.revision + 1, updated_at = now()
  returning * into created_arrival;

  select count(*) into present_count from public.attendance where session_id = target.id and status = 'present';
  total_cost := coalesce((target.rules_snapshot ->> 'totalCostCents')::integer, 0);
  update public.sessions set
    contribution_amount_cents = case
      when rules_snapshot ->> 'contributionMode' = 'divide_total' and present_count > 0 then round(total_cost::numeric / present_count)::integer
      else contribution_amount_cents end,
    revision = revision + 1, updated_at = now()
  where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'quick_arrival', 'attendance', created_arrival.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('player_id', selected_player.id, 'role', p_role, 'arrival_index', created_arrival.arrival_index));
  return to_jsonb(created_arrival) || jsonb_build_object('session_revision', target.revision + 1, 'player_id', selected_player.id);
end;
$$;

create or replace function public.set_attendance_status(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status,
  p_reason text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  present_count integer;
  total_cost integer;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  update public.attendance set status = p_status, revision = revision + 1, updated_at = now()
  where session_id = p_session_id and player_id = p_player_id;
  if not found then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
  select count(*) into present_count from public.attendance where session_id = target.id and status = 'present';
  total_cost := coalesce((target.rules_snapshot ->> 'totalCostCents')::integer, 0);
  update public.sessions set
    contribution_amount_cents = case
      when rules_snapshot ->> 'contributionMode' = 'divide_total' and present_count > 0 then round(total_cost::numeric / present_count)::integer
      else contribution_amount_cents end,
    revision = revision + 1, updated_at = now()
  where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.id, 'attendance_status', 'attendance', p_player_id, (select auth.uid()), p_idempotency_key, jsonb_build_object('status', p_status), nullif(trim(p_reason), ''));
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

revoke all on function public.create_additional_ranka(uuid, text, text, date) from public, anon;
revoke all on function public.start_ranka_session(uuid, date) from public, anon;
revoke all on function public.add_arrival_by_name(uuid, text, public.player_role_preference, bigint, uuid) from public, anon;
grant execute on function public.create_additional_ranka(uuid, text, text, date) to authenticated;
grant execute on function public.start_ranka_session(uuid, date) to authenticated;
grant execute on function public.add_arrival_by_name(uuid, text, public.player_role_preference, bigint, uuid) to authenticated;

commit;
