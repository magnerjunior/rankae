begin;

create function public.bulk_add_arrivals(
  p_session_id uuid,
  p_entries jsonb,
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
  entry jsonb;
  entry_name text;
  entry_role public.player_role_preference;
  selected_player public.players%rowtype;
  existing_arrival public.attendance%rowtype;
  duplicate_count integer;
  next_index integer;
  line_count integer;
  keeper_count integer;
  max_lines integer;
  max_keepers integer;
  present_count integer;
  total_cost integer;
  result_entries jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 1 or jsonb_array_length(p_entries) > 60 then
    raise exception 'A list must contain between 1 and 60 entries' using errcode = '22023';
  end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.audit_logs where session_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'arrivals', result_entries, 'idempotent', true);
  end if;

  max_lines := coalesce((target.rules_snapshot ->> 'maxLinePlayers')::integer, 24);
  max_keepers := coalesce((target.rules_snapshot ->> 'maxKeepers')::integer, 3);
  select
    count(*) filter (where role_preference <> 'keeper'),
    count(*) filter (where role_preference = 'keeper')
  into line_count, keeper_count
  from public.attendance where session_id = target.id and status = 'present';
  select coalesce(max(arrival_index), 0) + 1 into next_index
  from public.attendance where session_id = target.id;

  for entry in select value from jsonb_array_elements(p_entries) value loop
    entry_name := trim(entry ->> 'fullName');
    if entry ->> 'role' not in ('line', 'keeper') or char_length(entry_name) not between 2 and 120 then
      raise exception 'Invalid arrival entry' using errcode = '22023';
    end if;
    entry_role := (entry ->> 'role')::public.player_role_preference;

    select count(*) into duplicate_count from public.players
    where org_id = target.org_id and status = 'active' and normalized_name = private.normalize_name(entry_name);
    if duplicate_count > 1 then raise exception 'Use a more complete name for %', entry_name using errcode = '23505'; end if;
    if duplicate_count = 1 then
      select * into selected_player from public.players
      where org_id = target.org_id and status = 'active' and normalized_name = private.normalize_name(entry_name)
      limit 1;
    else
      insert into public.players (org_id, full_name, role_preference)
      values (target.org_id, entry_name, entry_role) returning * into selected_player;
    end if;

    select * into existing_arrival from public.attendance
    where session_id = target.id and player_id = selected_player.id;

    if existing_arrival.id is not null and existing_arrival.status = 'present' then
      if existing_arrival.role_preference <> entry_role then
        if entry_role = 'keeper' then
          if keeper_count >= max_keepers then raise exception 'Goalkeeper limit reached' using errcode = '23514'; end if;
          keeper_count := keeper_count + 1;
          line_count := greatest(0, line_count - 1);
        else
          if line_count >= max_lines then raise exception 'Line player limit reached' using errcode = '23514'; end if;
          line_count := line_count + 1;
          keeper_count := greatest(0, keeper_count - 1);
        end if;
        update public.attendance set role_preference = entry_role, revision = revision + 1, updated_at = now()
        where id = existing_arrival.id returning * into existing_arrival;
      end if;
    else
      if entry_role = 'keeper' then
        if keeper_count >= max_keepers then raise exception 'Goalkeeper limit reached' using errcode = '23514'; end if;
        keeper_count := keeper_count + 1;
      else
        if line_count >= max_lines then raise exception 'Line player limit reached' using errcode = '23514'; end if;
        line_count := line_count + 1;
      end if;
      insert into public.attendance (session_id, org_id, player_id, arrival_index, role_preference, idempotency_key, created_by)
      values (target.id, target.org_id, selected_player.id, next_index, entry_role, gen_random_uuid(), (select auth.uid()))
      on conflict (session_id, player_id) do update set status = 'present', arrival_index = excluded.arrival_index,
        role_preference = excluded.role_preference, revision = attendance.revision + 1, updated_at = now()
      returning * into existing_arrival;
      next_index := next_index + 1;
    end if;

    result_entries := result_entries || jsonb_build_array(jsonb_build_object(
      'id', existing_arrival.id,
      'playerId', selected_player.id,
      'fullName', selected_player.full_name,
      'role', case when existing_arrival.role_preference = 'keeper' then 'keeper' else 'line' end,
      'arrivalIndex', existing_arrival.arrival_index
    ));
  end loop;

  select count(*) into present_count from public.attendance where session_id = target.id and status = 'present';
  total_cost := coalesce((target.rules_snapshot ->> 'totalCostCents')::integer, 0);
  update public.sessions set
    contribution_amount_cents = case
      when rules_snapshot ->> 'contributionMode' = 'divide_total' and present_count > 0 then round(total_cost::numeric / present_count)::integer
      else contribution_amount_cents end,
    revision = revision + 1, updated_at = now()
  where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'bulk_arrival', 'attendance', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('count', jsonb_array_length(result_entries)));
  return jsonb_build_object('session_revision', target.revision + 1, 'arrivals', result_entries);
end;
$$;

create function public.reorder_session_arrival(
  p_session_id uuid,
  p_player_id uuid,
  p_target_position integer,
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
  ordered_ids uuid[];
  remaining_ids uuid[];
  reordered_ids uuid[];
  inactive_ids uuid[];
  old_position integer;
  position integer := 1;
  item_id uuid;
  result_entries jsonb;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.audit_logs where session_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;
  select array_agg(id order by arrival_index) into ordered_ids from public.attendance
  where session_id = target.id and status = 'present';
  old_position := array_position(ordered_ids, (select id from public.attendance where session_id = target.id and player_id = p_player_id));
  if old_position is null then raise exception 'Arrival not found' using errcode = 'P0002'; end if;
  if p_target_position < 1 or p_target_position > cardinality(ordered_ids) then raise exception 'Invalid target position' using errcode = '22023'; end if;

  remaining_ids := array_remove(ordered_ids, ordered_ids[old_position]);
  reordered_ids := coalesce(remaining_ids[1:p_target_position - 1], '{}'::uuid[])
    || array[ordered_ids[old_position]]
    || coalesce(remaining_ids[p_target_position:cardinality(remaining_ids)], '{}'::uuid[]);
  select array_agg(id order by arrival_index) into inactive_ids from public.attendance
  where session_id = target.id and status <> 'present';

  if exists (select 1 from public.attendance where session_id = target.id and arrival_index >= 9000) then
    raise exception 'Arrival index requires maintenance' using errcode = '54000';
  end if;
  update public.attendance set arrival_index = arrival_index + 10000 where session_id = target.id;
  foreach item_id in array reordered_ids loop
    update public.attendance set arrival_index = position, revision = revision + 1, updated_at = now() where id = item_id;
    position := position + 1;
  end loop;
  foreach item_id in array coalesce(inactive_ids, '{}'::uuid[]) loop
    update public.attendance set arrival_index = position, revision = revision + 1, updated_at = now() where id = item_id;
    position := position + 1;
  end loop;

  update public.sessions set revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.id, 'reorder_arrival', 'attendance', p_player_id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('position', old_position), jsonb_build_object('position', p_target_position));
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'playerId', a.player_id, 'fullName', p.full_name,
    'role', case when a.role_preference = 'keeper' then 'keeper' else 'line' end,
    'arrivalIndex', a.arrival_index
  ) order by a.arrival_index), '[]'::jsonb) into result_entries
  from public.attendance a join public.players p on p.id = a.player_id
  where a.session_id = target.id and a.status = 'present';
  return jsonb_build_object('session_revision', target.revision + 1, 'arrivals', result_entries);
end;
$$;

create function public.rename_arrival_player(
  p_session_id uuid,
  p_player_id uuid,
  p_full_name text,
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
begin
  if char_length(trim(p_full_name)) not between 2 and 120 then raise exception 'Invalid name' using errcode = '22023'; end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  select * into selected_player from public.players where id = p_player_id and org_id = target.org_id for update;
  if selected_player.id is null or not exists (select 1 from public.attendance where session_id = target.id and player_id = selected_player.id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.players where org_id = target.org_id and id <> selected_player.id and status = 'active' and normalized_name = private.normalize_name(p_full_name)) then
    raise exception 'Name already exists' using errcode = '23505';
  end if;
  update public.players set full_name = trim(p_full_name), revision = revision + 1, updated_at = now()
  where id = selected_player.id;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.id, 'rename_player', 'player', selected_player.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('full_name', selected_player.full_name), jsonb_build_object('full_name', trim(p_full_name)));
  return jsonb_build_object('session_revision', target.revision + 1, 'player_id', selected_player.id, 'full_name', trim(p_full_name));
end;
$$;

revoke all on function public.bulk_add_arrivals(uuid, jsonb, bigint, uuid) from public, anon;
revoke all on function public.reorder_session_arrival(uuid, uuid, integer, bigint, uuid) from public, anon;
revoke all on function public.rename_arrival_player(uuid, uuid, text, bigint, uuid) from public, anon;
grant execute on function public.bulk_add_arrivals(uuid, jsonb, bigint, uuid) to authenticated;
grant execute on function public.reorder_session_arrival(uuid, uuid, integer, bigint, uuid) to authenticated;
grant execute on function public.rename_arrival_player(uuid, uuid, text, bigint, uuid) to authenticated;

commit;
