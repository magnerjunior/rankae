begin;

-- Exposes only session dates/counts for an already enabled public portal.
create function public.get_public_ranka_calendar(
  p_slug text,
  p_grant_token text default null,
  p_month date default current_date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
  month_start date;
begin
  select * into target from public.rankas where slug = lower(trim(p_slug));
  if target.id is null or target.visibility = 'private_off' then return '[]'::jsonb; end if;
  if not private.can_manage_ranka(target.id)
    and target.visibility <> 'public'
    and not private.portal_grant_valid(target.id, p_grant_token) then
    return '[]'::jsonb;
  end if;

  month_start := date_trunc('month', coalesce(p_month, current_date))::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', days.scheduled_on, 'count', days.session_count) order by days.scheduled_on)
    from (
      select s.scheduled_on, count(*)::integer as session_count
      from public.sessions s
      where s.ranka_id = target.id
        and s.scheduled_on >= month_start
        and s.scheduled_on < (month_start + interval '1 month')::date
        and s.scheduled_on <= (clock_timestamp() at time zone target.timezone)::date
        and (s.state = 'completed'
          or exists (select 1 from public.attendance a where a.session_id = s.id and a.status in ('present', 'left'))
          or exists (select 1 from public.matches m where m.session_id = s.id and m.state = 'completed'))
      group by s.scheduled_on
    ) days
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_ranka_calendar(text, text, date) from public;
grant execute on function public.get_public_ranka_calendar(text, text, date) to anon, authenticated;

create function public.edit_match_goal(
  p_event_id uuid,
  p_side public.field_side,
  p_goal_kind public.goal_kind,
  p_occurrence_ms bigint,
  p_scorer_player_id uuid,
  p_assist_player_id uuid,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.match_events%rowtype;
  target_match public.matches%rowtype;
begin
  if p_occurrence_ms < 0 or p_occurrence_ms > 86400000 then
    raise exception 'Invalid event time' using errcode = '22023';
  end if;
  if p_scorer_player_id is not null and p_scorer_player_id = p_assist_player_id then
    raise exception 'Scorer and assist must differ' using errcode = '22023';
  end if;

  select * into target_event
  from public.match_events
  where id = p_event_id and event_type = 'goal' and status = 'active'
  for update;
  if target_event.id is null then raise exception 'Goal not found' using errcode = 'P0002'; end if;
  select * into target_match from public.matches where id = target_event.match_id for update;
  if not private.can_manage_ranka(target_match.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where match_id = target_match.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('match_revision', target_match.revision, 'idempotent', true);
  end if;
  if target_match.revision <> p_expected_revision then
    raise exception 'Revision conflict' using errcode = '40001', detail = target_match.revision::text;
  end if;
  if p_scorer_player_id is not null and not exists (
    select 1 from public.match_assignments
    where match_id = target_match.id and player_id = p_scorer_player_id
      and field_side = case when p_goal_kind = 'own_goal' then case when p_side = 'yellow' then 'red'::public.field_side else 'yellow'::public.field_side end else p_side end
      and status <> 'cancelled'
  ) then raise exception 'Scorer must belong to the correct side' using errcode = '23503'; end if;
  if p_assist_player_id is not null and not exists (
    select 1 from public.match_assignments
    where match_id = target_match.id and player_id = p_assist_player_id
      and field_side = p_side and status <> 'cancelled'
  ) then raise exception 'Assist must belong to the scoring side' using errcode = '23503'; end if;

  update public.match_events
  set side = p_side, goal_kind = p_goal_kind, occurrence_ms = p_occurrence_ms,
      scorer_player_id = p_scorer_player_id, assist_player_id = p_assist_player_id,
      version = version + 1
  where id = target_event.id;
  update public.matches set revision = revision + 1, updated_at = clock_timestamp() where id = target_match.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (
    target_event.org_id, target_match.ranka_id, target_match.session_id, target_match.id,
    'edit_match_goal', 'match_event', target_event.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('side', target_event.side, 'goal_kind', target_event.goal_kind, 'occurrence_ms', target_event.occurrence_ms, 'scorer_player_id', target_event.scorer_player_id, 'assist_player_id', target_event.assist_player_id),
    jsonb_build_object('side', p_side, 'goal_kind', p_goal_kind, 'occurrence_ms', p_occurrence_ms, 'scorer_player_id', p_scorer_player_id, 'assist_player_id', p_assist_player_id)
  );
  return jsonb_build_object('match_revision', target_match.revision + 1);
end;
$$;

revoke all on function public.edit_match_goal(uuid, public.field_side, public.goal_kind, bigint, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.edit_match_goal(uuid, public.field_side, public.goal_kind, bigint, uuid, uuid, bigint, uuid) to authenticated;

create function public.set_session_keeper_waiver(
  p_session_id uuid,
  p_enabled boolean,
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
  before_enabled boolean;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then
    raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text;
  end if;
  before_enabled := coalesce((target.rules_snapshot ->> 'waiveKeeperContributions')::boolean, false);

  if p_enabled then
    insert into public.contribution_records (session_id, org_id, player_id, amount_cents, status, note, recorded_by)
    select target.id, target.org_id, attendance.player_id, target.contribution_amount_cents, 'waived', 'Isento pela regra de goleiro', (select auth.uid())
    from public.attendance attendance
    where attendance.session_id = target.id and attendance.status = 'present' and attendance.role_preference = 'keeper'
    on conflict (session_id, player_id) do update
      set amount_cents = excluded.amount_cents, status = 'waived', note = excluded.note,
          recorded_by = excluded.recorded_by, updated_at = clock_timestamp(), recorded_at = clock_timestamp()
      where contribution_records.status = 'pending';
  else
    update public.contribution_records
    set status = 'pending', note = null, updated_at = clock_timestamp(), recorded_at = clock_timestamp()
    where session_id = target.id and status = 'waived' and note = 'Isento pela regra de goleiro';
  end if;

  update public.sessions
  set rules_snapshot = jsonb_set(coalesce(rules_snapshot, '{}'::jsonb), '{waiveKeeperContributions}', to_jsonb(p_enabled), true),
      revision = revision + 1, updated_at = clock_timestamp()
  where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.id, 'set_keeper_payment_exemption', 'session', target.id,
    (select auth.uid()), p_idempotency_key,
    jsonb_build_object('waiveKeeperContributions', before_enabled),
    jsonb_build_object('waiveKeeperContributions', p_enabled));
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

revoke all on function public.set_session_keeper_waiver(uuid, boolean, bigint, uuid) from public, anon;
grant execute on function public.set_session_keeper_waiver(uuid, boolean, bigint, uuid) to authenticated;

create function private.apply_keeper_payment_waiver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target public.sessions%rowtype;
begin
  if new.status <> 'present' or new.role_preference <> 'keeper' then return new; end if;
  select * into target from public.sessions where id = new.session_id;
  if not coalesce((target.rules_snapshot ->> 'waiveKeeperContributions')::boolean, false) then return new; end if;
  insert into public.contribution_records (session_id, org_id, player_id, amount_cents, status, note, recorded_by)
  values (target.id, target.org_id, new.player_id, target.contribution_amount_cents, 'waived', 'Isento pela regra de goleiro', new.created_by)
  on conflict (session_id, player_id) do update
    set amount_cents = excluded.amount_cents, status = 'waived', note = excluded.note,
        recorded_by = excluded.recorded_by, updated_at = clock_timestamp(), recorded_at = clock_timestamp()
    where contribution_records.status = 'pending';
  return new;
end;
$$;

revoke all on function private.apply_keeper_payment_waiver() from public, anon, authenticated;
create trigger attendance_keeper_payment_waiver
  after insert or update of status, role_preference on public.attendance
  for each row execute function private.apply_keeper_payment_waiver();

commit;
