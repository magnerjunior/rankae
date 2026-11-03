create or replace function public.generate_session_squads(
  p_session_id uuid,
  p_squad_size integer,
  p_method text,
  p_seed integer,
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
  created_count integer;
begin
  if p_squad_size not between 2 and 12 or p_method not in ('sequential', 'shuffle_blocks') then
    raise exception 'Invalid squad formation options' using errcode = '22023';
  end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.matches where session_id = p_session_id) then
    raise exception 'Squads cannot be regenerated after matches exist' using errcode = '55000';
  end if;

  delete from public.squads where session_id = p_session_id;

  with eligible as (
    select a.player_id, row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*, row_number() over (order by
      case when e.arrival_order <= p_squad_size * 2 then 0 else 1 end,
      case
        when p_method = 'shuffle_blocks' and e.arrival_order <= p_squad_size * 2
          then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text)
        else lpad(e.arrival_order::text, 12, '0')
      end
    ) as formation_order
    from eligible e
  ), squad_numbers as (
    select distinct (floor((formation_order - 1)::numeric / p_squad_size)::integer + 1) as squad_number
    from ordered
  )
  insert into public.squads (session_id, ranka_id, org_id, squad_number, queue_position, formation_method, shuffle_seed)
  select p_session_id, target.ranka_id, target.org_id, squad_number, squad_number, p_method,
    case when p_method = 'shuffle_blocks' then coalesce(p_seed, 1) end
  from squad_numbers order by squad_number;

  with eligible as (
    select a.player_id, row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*, row_number() over (order by
      case when e.arrival_order <= p_squad_size * 2 then 0 else 1 end,
      case
        when p_method = 'shuffle_blocks' and e.arrival_order <= p_squad_size * 2
          then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text)
        else lpad(e.arrival_order::text, 12, '0')
      end
    ) as formation_order
    from eligible e
  )
  insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
  select s.id, p_session_id, target.org_id, o.player_id,
    ((o.formation_order - 1) % p_squad_size + 1)::integer,
    p_method, (select auth.uid())
  from ordered o
  join public.squads s on s.session_id = p_session_id
    and s.squad_number = floor((o.formation_order - 1)::numeric / p_squad_size)::integer + 1;

  select count(*) into created_count from public.squads where session_id = p_session_id;
  update public.sessions set state = 'team_formation', revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'generate_squads', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('squad_size', p_squad_size, 'method', p_method, 'seed', p_seed, 'squad_count', created_count, 'shuffle_scope', 'first_two_only'));
  return jsonb_build_object('session_revision', target.revision + 1, 'squad_count', created_count);
end;
$$;

create or replace function private.requeue_squad_as_new(
  p_squad_id uuid,
  p_new_number integer,
  p_new_queue_position integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_squad public.squads%rowtype;
  new_squad_id uuid;
begin
  select * into old_squad from public.squads where id = p_squad_id for update;
  if old_squad.id is null then raise exception 'Squad not found' using errcode = 'P0002'; end if;

  insert into public.squads (
    session_id, ranka_id, org_id, squad_number, state, queue_position,
    formation_method, shuffle_seed
  ) values (
    old_squad.session_id, old_squad.ranka_id, old_squad.org_id, p_new_number,
    'waiting', p_new_queue_position, 'manual', old_squad.shuffle_seed
  ) returning id into new_squad_id;

  with moved as (
    update public.squad_members
    set removed_at = now(), removed_reason = 'Recomposto como T' || p_new_number::text
    where squad_id = old_squad.id and removed_at is null
    returning session_id, org_id, player_id, assignment_order, assigned_by
  )
  insert into public.squad_members (
    squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by
  )
  select new_squad_id, session_id, org_id, player_id, assignment_order, 'rotation_requeue', assigned_by
  from moved;

  update public.squads set state = 'archived', updated_at = now() where id = old_squad.id;
  return new_squad_id;
end;
$$;

revoke all on function private.requeue_squad_as_new(uuid, integer, integer) from public, anon, authenticated;

create or replace function public.complete_match_and_rotate(
  p_match_id uuid,
  p_result_override text,
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
  target public.matches%rowtype;
  target_session public.sessions%rowtype;
  yellow_score integer;
  red_score integer;
  result_value text;
  tie_winner uuid;
  outgoing_one uuid;
  outgoing_two uuid;
  requeued_one uuid;
  requeued_two uuid;
  incoming_yellow uuid;
  incoming_red uuid;
  next_match public.matches%rowtype;
  next_ordinal integer;
  max_queue integer;
  max_squad_number integer;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  select * into target_session from public.sessions where id = target.session_id for update;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('match_id', target.id, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  select
    count(*) filter (where side = 'yellow' and (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted'))),
    count(*) filter (where side = 'red' and (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted')))
  into yellow_score, red_score from public.match_events where match_id = target.id and status = 'active';
  select nullif(metadata ->> 'winner_squad_id', '')::uuid into tie_winner from public.match_events where match_id = target.id and event_type = 'tie_resolution' and status = 'active' order by created_at desc limit 1;

  if p_result_override is not null then
    if p_result_override not in ('yellow', 'red', 'both_out') or char_length(trim(p_reason)) < 3 then raise exception 'Override requires a valid result and reason' using errcode = '22023'; end if;
    result_value := p_result_override;
  elsif yellow_score > red_score then result_value := 'yellow';
  elsif red_score > yellow_score then result_value := 'red';
  elsif tie_winner = target.yellow_squad_id then result_value := 'yellow';
  elsif tie_winner = target.red_squad_id then result_value := 'red';
  elsif exists (select 1 from public.match_events where match_id = target.id and event_type = 'tie_resolution' and metadata ->> 'method' = 'both_out' and status = 'active') then result_value := 'both_out';
  else raise exception 'Tie must be resolved before rotation' using errcode = '55000';
  end if;

  select coalesce(max(queue_position), 0), coalesce(max(squad_number), 0)
  into max_queue, max_squad_number from public.squads where session_id = target.session_id;
  if result_value = 'yellow' then
    outgoing_one := target.red_squad_id;
    incoming_yellow := target.yellow_squad_id;
    select id into incoming_red from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
  elsif result_value = 'red' then
    outgoing_one := target.yellow_squad_id;
    incoming_red := target.red_squad_id;
    select id into incoming_yellow from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
  else
    outgoing_one := target.yellow_squad_id;
    outgoing_two := target.red_squad_id;
    select id into incoming_yellow from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
    select id into incoming_red from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id, incoming_yellow) order by queue_position limit 1;
  end if;

  if outgoing_one is not null then
    requeued_one := private.requeue_squad_as_new(outgoing_one, max_squad_number + 1, max_queue + 1);
  end if;
  if outgoing_two is not null then
    requeued_two := private.requeue_squad_as_new(outgoing_two, max_squad_number + 2, max_queue + 2);
  end if;
  update public.squads set state = 'field', updated_at = now() where id in (incoming_yellow, incoming_red);
  update public.matches set state = 'completed', ended_at = clock_timestamp(), started_at_server = null, revision = revision + 1, updated_at = now() where id = target.id;

  if incoming_yellow is not null and incoming_red is not null then
    next_ordinal := target.ordinal + 1;
    insert into public.matches (session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state, regulation_duration_ms, overtime_duration_ms, duration_limit_ms, rule_snapshot)
    values (target.session_id, target.ranka_id, target.org_id, next_ordinal, incoming_yellow, incoming_red, 'ready', target.regulation_duration_ms, target.overtime_duration_ms, target.regulation_duration_ms, target.rule_snapshot)
    returning * into next_match;
    insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
    select next_match.id, target.session_id, target.org_id, sm.player_id, sm.squad_id,
      case when sm.squad_id = incoming_yellow then 'yellow'::public.field_side else 'red'::public.field_side end, 'line', (select auth.uid())
    from public.squad_members sm where sm.squad_id in (incoming_yellow, incoming_red) and sm.removed_at is null;
  end if;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'complete_and_rotate', 'match', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('result', result_value, 'next_match_id', next_match.id, 'yellow_score', yellow_score, 'red_score', red_score, 'requeued_squad_ids', jsonb_build_array(requeued_one, requeued_two)), nullif(trim(p_reason), ''));
  return jsonb_build_object('completed_match_id', target.id, 'next_match_id', next_match.id, 'result', result_value, 'session_revision', target_session.revision + 1);
end;
$$;

do $$
declare
  resting public.squads%rowtype;
  next_number integer;
  next_queue integer;
begin
  for resting in
    select s.* from public.squads s
    join public.sessions ses on ses.id = s.session_id
    where s.state = 'resting' and ses.state <> 'completed'
    order by s.session_id, s.queue_position
  loop
    select coalesce(max(squad_number), 0) + 1, coalesce(max(queue_position), 0) + 1
    into next_number, next_queue from public.squads where session_id = resting.session_id;
    perform private.requeue_squad_as_new(resting.id, next_number, next_queue);
  end loop;
end;
$$;

create or replace function public.get_session_summary(p_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare target public.sessions%rowtype; payload jsonb;
begin
  select * into target from public.sessions where id = p_session_id;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;

  with scores as (
    select m.id, m.yellow_squad_id, m.red_squad_id,
      count(*) filter (where e.status = 'active' and e.side = 'yellow' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::int yellow_score,
      count(*) filter (where e.status = 'active' and e.side = 'red' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::int red_score
    from public.matches m left join public.match_events e on e.match_id = m.id
    where m.session_id = target.id and m.state = 'completed'
    group by m.id
  ), winners as (
    select s.*, case when yellow_score > red_score then yellow_squad_id when red_score > yellow_score then red_squad_id else (
      select nullif(e.metadata ->> 'winner_squad_id','')::uuid from public.match_events e where e.match_id = s.id and e.event_type = 'tie_resolution' and e.status = 'active' order by e.created_at desc limit 1
    ) end winner_id from scores s
  ), top_squad as (
    select winner_id squad_id, count(*)::int wins from winners where winner_id is not null group by winner_id order by wins desc, winner_id limit 1
  ), goal_totals as (
    select e.scorer_player_id player_id, count(*)::int total from public.match_events e join public.matches m on m.id = e.match_id
    where m.session_id = target.id and m.state = 'completed' and e.status = 'active' and e.event_type = 'goal' and e.scorer_player_id is not null and coalesce(e.goal_kind::text,'normal') <> 'own_goal'
    group by e.scorer_player_id order by total desc, e.scorer_player_id limit 1
  ), assist_totals as (
    select e.assist_player_id player_id, count(*)::int total from public.match_events e join public.matches m on m.id = e.match_id
    where m.session_id = target.id and m.state = 'completed' and e.status = 'active' and e.event_type = 'goal' and e.assist_player_id is not null
    group by e.assist_player_id order by total desc, e.assist_player_id limit 1
  ), keeper_totals as (
    select ma.player_id, count(distinct ma.match_id)::int matches,
      sum(case when ma.field_side = 'yellow' then w.red_score else w.yellow_score end)::int conceded
    from public.match_assignments ma join winners w on w.id = ma.match_id
    where ma.role in ('keeper','borrowed_keeper') and ma.status <> 'cancelled'
    group by ma.player_id order by conceded asc, matches desc, ma.player_id limit 1
  )
  select jsonb_build_object(
    'matches', (select count(*) from scores),
    'topTeam', (select jsonb_build_object(
      'number', s.squad_number,
      'wins', t.wins,
      'players', coalesce((
        select jsonb_agg(roster.full_name order by roster.full_name)
        from (
          select distinct p.full_name
          from public.match_assignments ma
          join public.matches m on m.id = ma.match_id
          join public.players p on p.id = ma.player_id
          where m.session_id = target.id and ma.squad_id = t.squad_id and ma.role = 'line' and ma.status <> 'cancelled'
        ) roster
      ), '[]'::jsonb)
    ) from top_squad t join public.squads s on s.id = t.squad_id),
    'topScorer', (select jsonb_build_object('name', p.full_name, 'total', g.total) from goal_totals g join public.players p on p.id = g.player_id),
    'topAssist', (select jsonb_build_object('name', p.full_name, 'total', a.total) from assist_totals a join public.players p on p.id = a.player_id),
    'bestKeeper', (select jsonb_build_object('name', p.full_name, 'conceded', k.conceded, 'matches', k.matches) from keeper_totals k join public.players p on p.id = k.player_id)
  ) into payload;
  return payload;
end;
$$;
