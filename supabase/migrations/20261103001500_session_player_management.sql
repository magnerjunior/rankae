create or replace function public.swap_squad_players(
  p_session_id uuid,
  p_first_squad_id uuid,
  p_first_player_id uuid,
  p_second_squad_id uuid,
  p_second_player_id uuid,
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
  active_match public.matches%rowtype;
  first_member public.squad_members%rowtype;
  second_member public.squad_members%rowtype;
begin
  if p_first_squad_id = p_second_squad_id or p_first_player_id = p_second_player_id then raise exception 'Players must belong to different squads' using errcode = '22023'; end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.state = 'completed' then raise exception 'Session is completed' using errcode = '55000'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  select * into active_match from public.matches where session_id = p_session_id and state not in ('completed','cancelled') for update;
  if active_match.id is not null and active_match.state not in ('draft','ready') then raise exception 'Teams can only be edited before the clock starts' using errcode = '55000'; end if;
  select * into first_member from public.squad_members where session_id = p_session_id and squad_id = p_first_squad_id and player_id = p_first_player_id and removed_at is null for update;
  select * into second_member from public.squad_members where session_id = p_session_id and squad_id = p_second_squad_id and player_id = p_second_player_id and removed_at is null for update;
  if first_member.id is null or second_member.id is null then raise exception 'Active squad member not found' using errcode = 'P0002'; end if;

  update public.squad_members
  set squad_id = case id when first_member.id then second_member.squad_id else first_member.squad_id end,
      assignment_order = case id when first_member.id then second_member.assignment_order else first_member.assignment_order end,
      assignment_reason = 'manual_swap'
  where id in (first_member.id, second_member.id);

  if active_match.id is not null then
    update public.match_assignments set status = 'cancelled', end_ms = coalesce(end_ms, 0)
    where match_id = active_match.id and role = 'line' and status <> 'cancelled';
    insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
    select active_match.id, target.id, target.org_id, sm.player_id, sm.squad_id,
      case when sm.squad_id = active_match.yellow_squad_id then 'yellow'::public.field_side else 'red'::public.field_side end,
      'line', (select auth.uid())
    from public.squad_members sm
    where sm.squad_id in (active_match.yellow_squad_id, active_match.red_squad_id) and sm.removed_at is null;
    update public.matches set revision = revision + 1, updated_at = now() where id = active_match.id;
  end if;

  update public.sessions set revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, active_match.id, 'swap_squad_players', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('first_squad_id', p_first_squad_id, 'first_player_id', p_first_player_id, 'second_squad_id', p_second_squad_id, 'second_player_id', p_second_player_id));
  return jsonb_build_object('session_revision', target.revision + 1, 'match_revision', case when active_match.id is null then null else active_match.revision + 1 end);
end;
$$;

create function public.manage_match_player(
  p_session_id uuid,
  p_match_id uuid,
  p_target_squad_id uuid,
  p_outgoing_player_id uuid,
  p_incoming_player_id uuid,
  p_mark_left boolean,
  p_expected_session_revision bigint,
  p_expected_match_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  target_match public.matches%rowtype;
  outgoing_member public.squad_members%rowtype;
  incoming_member public.squad_members%rowtype;
  source_squad_id uuid;
  deficit_squad_id uuid;
  donor_squad_id uuid;
  donor_member public.squad_members%rowtype;
  vacancy_order integer;
  elapsed bigint;
  target_side public.field_side;
begin
  if p_incoming_player_id is null and not p_mark_left then raise exception 'Choose a replacement or mark departure' using errcode = '22023'; end if;
  if p_incoming_player_id = p_outgoing_player_id then raise exception 'Players must be different' using errcode = '22023'; end if;
  select * into target from public.sessions where id = p_session_id for update;
  select * into target_match from public.matches where id = p_match_id and session_id = p_session_id for update;
  if target.id is null or target_match.id is null then raise exception 'Session or match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.state = 'completed' or target_match.state in ('completed','cancelled') then raise exception 'Session or match is closed' using errcode = '55000'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'match_revision', target_match.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_session_revision or target_match.revision <> p_expected_match_revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  if p_target_squad_id not in (target_match.yellow_squad_id, target_match.red_squad_id) then raise exception 'Target squad is not playing' using errcode = '23514'; end if;
  target_side := case when p_target_squad_id = target_match.yellow_squad_id then 'yellow'::public.field_side else 'red'::public.field_side end;
  select * into outgoing_member from public.squad_members where squad_id = p_target_squad_id and player_id = p_outgoing_player_id and removed_at is null for update;
  if outgoing_member.id is null then raise exception 'Outgoing player is not active' using errcode = 'P0002'; end if;

  if p_incoming_player_id is not null then
    if not exists (select 1 from public.attendance where session_id = p_session_id and player_id = p_incoming_player_id and status = 'present') then raise exception 'Incoming player is not present' using errcode = '23514'; end if;
    select * into incoming_member from public.squad_members where session_id = p_session_id and player_id = p_incoming_player_id and removed_at is null for update;
    source_squad_id := incoming_member.squad_id;
    if source_squad_id in (target_match.yellow_squad_id, target_match.red_squad_id) then raise exception 'Replacement must come from the waiting line' using errcode = '23514'; end if;
  end if;

  elapsed := private.current_match_elapsed(target_match);
  update public.squad_members set removed_at = now(), removed_reason = case when p_mark_left then 'Saiu do ranka do dia' else 'Troca durante a partida' end where id = outgoing_member.id;
  update public.match_assignments set end_ms = greatest(start_ms, elapsed)
  where match_id = target_match.id and player_id = p_outgoing_player_id and role = 'line' and status <> 'cancelled' and end_ms is null;

  if p_incoming_player_id is not null then
    if incoming_member.id is not null then update public.squad_members set removed_at = now(), removed_reason = 'Entrou no time em campo' where id = incoming_member.id; end if;
    insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
    values (p_target_squad_id, p_session_id, target.org_id, p_incoming_player_id, outgoing_member.assignment_order, 'match_replacement', (select auth.uid()));
    if not p_mark_left and source_squad_id is not null then
      insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
      values (source_squad_id, p_session_id, target.org_id, p_outgoing_player_id, incoming_member.assignment_order, 'match_swap', (select auth.uid()));
    end if;
    if p_mark_left and source_squad_id is not null then
      deficit_squad_id := source_squad_id;
      vacancy_order := incoming_member.assignment_order;
      loop
        select next_squad.id into donor_squad_id
        from public.squads current_squad
        join public.squads next_squad on next_squad.session_id = current_squad.session_id
          and next_squad.queue_position > current_squad.queue_position
          and next_squad.state = 'waiting'
        where current_squad.id = deficit_squad_id
        order by next_squad.queue_position limit 1;
        exit when donor_squad_id is null;
        select * into donor_member from public.squad_members
        where squad_id = donor_squad_id and removed_at is null
        order by assignment_order limit 1 for update;
        exit when donor_member.id is null;
        update public.squad_members set removed_at = now(), removed_reason = 'Recomposição da fila após saída' where id = donor_member.id;
        insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
        values (deficit_squad_id, p_session_id, target.org_id, donor_member.player_id, vacancy_order, 'departure_cascade', (select auth.uid()));
        deficit_squad_id := donor_squad_id;
        vacancy_order := donor_member.assignment_order;
        donor_squad_id := null;
        donor_member := null;
      end loop;
    end if;
    update public.match_assignments set status = 'cancelled', end_ms = coalesce(end_ms, greatest(start_ms, elapsed))
    where match_id = target_match.id and player_id = p_incoming_player_id and status <> 'cancelled' and end_ms is null;
    insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, start_ms, created_by)
    values (target_match.id, p_session_id, target.org_id, p_incoming_player_id, p_target_squad_id, target_side, 'line', elapsed, (select auth.uid()));
    insert into public.substitutions (session_id, match_id, org_id, source_squad_id, target_squad_id, outgoing_player_id, incoming_player_id, override_priority, reason, created_by)
    values (p_session_id, target_match.id, target.org_id, source_squad_id, p_target_squad_id, p_outgoing_player_id, p_incoming_player_id, false, case when p_mark_left then 'Jogador saiu do ranka do dia' else 'Troca pelo organizador' end, (select auth.uid()));
  end if;

  if p_mark_left then
    update public.attendance set status = 'left', revision = revision + 1, updated_at = now() where session_id = p_session_id and player_id = p_outgoing_player_id;
  end if;
  update public.matches set revision = revision + 1, updated_at = now() where id = target_match.id;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.id, target_match.id, case when p_mark_left then 'player_left_session' else 'match_player_swap' end,
    'player', p_outgoing_player_id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('incoming_player_id', p_incoming_player_id, 'target_squad_id', p_target_squad_id, 'source_squad_id', source_squad_id, 'occurrence_ms', elapsed),
    case when p_mark_left then 'Saiu do ranka do dia' else 'Troca pelo organizador' end);
  return jsonb_build_object('session_revision', target.revision + 1, 'match_revision', target_match.revision + 1);
end;
$$;

revoke all on function public.manage_match_player(uuid, uuid, uuid, uuid, uuid, boolean, bigint, bigint, uuid) from public, anon;
grant execute on function public.manage_match_player(uuid, uuid, uuid, uuid, uuid, boolean, bigint, bigint, uuid) to authenticated;

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
    where m.session_id = target.id and m.state = 'completed' group by m.id
  ), outcomes as (
    select s.*,
      case when yellow_score > red_score then yellow_squad_id when red_score > yellow_score then red_squad_id else (select nullif(e.metadata ->> 'winner_squad_id','')::uuid from public.match_events e where e.match_id = s.id and e.event_type = 'tie_resolution' and e.status = 'active' order by e.created_at desc limit 1) end winner_id,
      case when yellow_score > red_score then red_squad_id when red_score > yellow_score then yellow_squad_id else null end loser_id
    from scores s
  ), squad_rosters as (
    select distinct m.id match_id, ma.squad_id, s.squad_number,
      string_agg(distinct ma.player_id::text, ',' order by ma.player_id::text) signature,
      jsonb_agg(distinct p.full_name order by p.full_name) players
    from public.matches m join public.match_assignments ma on ma.match_id = m.id and ma.role = 'line'
    join public.squads s on s.id = ma.squad_id join public.players p on p.id = ma.player_id
    where m.session_id = target.id and m.state = 'completed'
    group by m.id, ma.squad_id, s.squad_number
  ), roster_totals as (
    select r.signature, min(r.squad_number) number,
      string_agg(distinct 'T' || r.squad_number::text, '/' order by 'T' || r.squad_number::text) label,
      (jsonb_agg(r.players order by r.squad_number)->0) players,
      count(*) filter (where o.winner_id = r.squad_id)::int wins,
      count(*) filter (where o.loser_id = r.squad_id)::int losses
    from squad_rosters r join outcomes o on o.id = r.match_id group by r.signature
  ), top_roster as (
    select * from roster_totals order by wins desc, losses asc, number limit 1
  ), bottom_roster as (
    select * from roster_totals order by losses desc, wins asc, number limit 1
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
      sum(case when ma.field_side = 'yellow' then o.red_score else o.yellow_score end)::int conceded
    from public.match_assignments ma join outcomes o on o.id = ma.match_id
    where ma.role in ('keeper','borrowed_keeper') and ma.status <> 'cancelled'
    group by ma.player_id
  )
  select jsonb_build_object(
    'matches', (select count(*) from scores),
    'topTeam', (select jsonb_build_object('number', number, 'label', label, 'wins', wins, 'players', players) from top_roster),
    'bottomTeam', (select jsonb_build_object('number', number, 'label', label, 'losses', losses, 'players', players) from bottom_roster),
    'topScorer', (select jsonb_build_object('name', p.full_name, 'total', g.total) from goal_totals g join public.players p on p.id = g.player_id),
    'topAssist', (select jsonb_build_object('name', p.full_name, 'total', a.total) from assist_totals a join public.players p on p.id = a.player_id),
    'bestKeeper', (select jsonb_build_object('name', p.full_name, 'conceded', k.conceded, 'matches', k.matches) from keeper_totals k join public.players p on p.id = k.player_id order by k.conceded asc, k.matches desc limit 1),
    'worstKeeper', (select jsonb_build_object('name', p.full_name, 'conceded', k.conceded, 'matches', k.matches) from keeper_totals k join public.players p on p.id = k.player_id order by k.conceded desc, k.matches desc limit 1)
  ) into payload;
  return payload;
end;
$$;
