create function public.get_session_summary(p_session_id uuid)
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
    'topTeam', (select jsonb_build_object('number', s.squad_number, 'wins', t.wins, 'players', coalesce((select jsonb_agg(p.full_name order by sm.assignment_order) from public.squad_members sm join public.players p on p.id = sm.player_id where sm.squad_id = t.squad_id and sm.removed_at is null), '[]'::jsonb)) from top_squad t join public.squads s on s.id = t.squad_id),
    'topScorer', (select jsonb_build_object('name', p.full_name, 'total', g.total) from goal_totals g join public.players p on p.id = g.player_id),
    'topAssist', (select jsonb_build_object('name', p.full_name, 'total', a.total) from assist_totals a join public.players p on p.id = a.player_id),
    'bestKeeper', (select jsonb_build_object('name', p.full_name, 'conceded', k.conceded, 'matches', k.matches) from keeper_totals k join public.players p on p.id = k.player_id)
  ) into payload;
  return payload;
end;
$$;

revoke all on function public.get_session_summary(uuid) from public, anon;
grant execute on function public.get_session_summary(uuid) to authenticated;
