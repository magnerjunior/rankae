begin;

create function private.get_ranka_statistics_projection(
  p_slug text,
  p_grant_token text,
  p_period text,
  p_specific_date date,
  p_internal boolean
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
  local_today date;
  period_start date;
  period_end date;
  period_year integer;
  period_label text;
  snapshot jsonb;
begin
  if p_period is null or p_period not in ('last', 'month', 'season', 'day') then p_period := 'last'; end if;
  select * into target_ranka from public.rankas where slug = lower(trim(p_slug));
  if target_ranka.id is null then return null; end if;
  if p_internal then
    if not private.can_manage_ranka(target_ranka.id) then return null; end if;
  elsif target_ranka.visibility = 'private_off' or (
    target_ranka.visibility <> 'public' and not private.portal_grant_valid(target_ranka.id, p_grant_token)
  ) then return null;
  end if;

  select * into target_session
  from public.sessions where ranka_id = target_ranka.id
  order by scheduled_on desc, created_at desc limit 1;

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
  ), scored_matches as (
    select m.*, fs.scheduled_on,
      (select al.after_data ->> 'result' from public.audit_logs al
       where al.match_id = m.id and al.action = 'complete_and_rotate'
       order by al.created_at desc limit 1) as result_value,
      (select count(*) from public.match_events e where e.match_id = m.id and e.status = 'active' and e.side = 'yellow' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::integer as yellow_score,
      (select count(*) from public.match_events e where e.match_id = m.id and e.status = 'active' and e.side = 'red' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted')))::integer as red_score
    from public.matches m join filtered_sessions fs on fs.id = m.session_id
    where m.state = 'completed'
  ), completed_matches as (
    select sm.*, coalesce(sm.result_value, case when sm.yellow_score > sm.red_score then 'yellow' when sm.red_score > sm.yellow_score then 'red' else 'both_out' end) as outcome
    from scored_matches sm
  ), participants as (
    select distinct cm.id as match_id, cm.yellow_squad_id, cm.red_squad_id, cm.outcome as result_value,
      ma.player_id, case ma.field_side when 'yellow' then cm.yellow_squad_id when 'red' then cm.red_squad_id else ma.squad_id end as squad_id
    from completed_matches cm
    join public.match_assignments ma on ma.match_id = cm.id and ma.status <> 'cancelled' and ma.role <> 'ball_boy'
  ), player_stats as (
    select p.id, case when p_internal then p.full_name else private.public_player_name(p) end as display_name,
      count(distinct part.match_id)::integer as matches,
      count(distinct part.match_id) filter (where (part.result_value = 'yellow' and part.squad_id = part.yellow_squad_id) or (part.result_value = 'red' and part.squad_id = part.red_squad_id))::integer as wins,
      count(distinct part.match_id) filter (where (part.result_value = 'yellow' and part.squad_id = part.red_squad_id) or (part.result_value = 'red' and part.squad_id = part.yellow_squad_id))::integer as losses,
      count(distinct part.match_id) filter (where part.result_value = 'both_out')::integer as draws,
      count(distinct e.id) filter (where e.event_type = 'goal' and e.status = 'active' and e.scorer_player_id = p.id and e.goal_kind is distinct from 'own_goal')::integer as goals,
      count(distinct e.id) filter (where e.event_type = 'goal' and e.status = 'active' and e.assist_player_id = p.id)::integer as assists,
      count(distinct e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id)::integer as penalties_taken,
      count(distinct e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id and e.penalty_outcome = 'converted')::integer as penalties_converted,
      count(distinct e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.scorer_player_id = p.id and e.penalty_outcome in ('missed', 'saved'))::integer as penalties_missed,
      count(distinct e.id) filter (where e.event_type = 'penalty_attempt' and e.status = 'active' and e.keeper_player_id = p.id and e.penalty_outcome = 'saved')::integer as penalties_saved
    from participants part
    join public.players p on p.id = part.player_id
    left join public.match_events e on e.match_id = part.match_id
    where case when p_internal then p.full_name else private.public_player_name(p) end is not null
    group by p.id, case when p_internal then p.full_name else private.public_player_name(p) end
  )
  select jsonb_build_object(
    'rankaName', target_ranka.name,
    'slug', target_ranka.slug,
    'sessionDate', target_session.scheduled_on,
    'nextSquads', '[]'::jsonb,
    'results', coalesce((select jsonb_agg(result_payload order by scheduled_on desc, ordinal desc) from (
      select cm.scheduled_on, cm.ordinal, jsonb_build_object(
        'matchId', cm.id,
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
    'snapshotVersion', coalesce(target_session.revision, 0),
    'asOfServer', clock_timestamp()
  ) into snapshot;
  return snapshot;
end;
$$;


revoke all on function private.get_ranka_statistics_projection(text,text,text,date,boolean) from public, anon, authenticated;

create or replace function public.get_public_ranka_snapshot_phase3(p_slug text, p_grant_token text default null, p_period text default 'last', p_specific_date date default null)
returns jsonb language sql security definer stable set search_path = '' as $$
  select private.get_ranka_statistics_projection(p_slug, p_grant_token, p_period, p_specific_date, false);
$$;

create function public.get_internal_ranka_statistics(p_slug text, p_period text, p_specific_date date)
returns jsonb language sql security definer stable set search_path = '' as $$
  select private.get_ranka_statistics_projection(p_slug, null, p_period, p_specific_date, true);
$$;
revoke all on function public.get_internal_ranka_statistics(text,text,date) from public, anon;
grant execute on function public.get_internal_ranka_statistics(text,text,date) to authenticated;

create function public.get_ranka_match_details(p_slug text, p_match_id uuid, p_grant_token text, p_internal boolean)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare target public.rankas%rowtype;
begin
  select * into target from public.rankas where slug = lower(trim(p_slug));
  if target.id is null then return null; end if;
  if p_internal then
    if not private.can_manage_ranka(target.id) then return null; end if;
  elsif target.visibility = 'private_off' or (
    target.visibility <> 'public' and not private.portal_grant_valid(target.id, p_grant_token)
  ) then return null;
  end if;
  if not exists (select 1 from public.matches where id = p_match_id and ranka_id = target.id and state = 'completed') then return null; end if;
  return (
    with players as (
      select ma.field_side, p.id, case when p_internal then p.full_name else private.public_player_name(p) end as name
      from public.match_assignments ma join public.players p on p.id = ma.player_id
      where ma.match_id = p_match_id and ma.status <> 'cancelled' and ma.role <> 'ball_boy'
      group by ma.field_side, p.id
    )
    select jsonb_build_object(
      'yellow', coalesce((select jsonb_agg(name order by name, id) from players where field_side = 'yellow' and name is not null), '[]'::jsonb),
      'red', coalesce((select jsonb_agg(name order by name, id) from players where field_side = 'red' and name is not null), '[]'::jsonb),
      'goals', coalesce((
        select jsonb_agg(jsonb_build_object('ms', e.occurrence_ms, 'side', e.side, 'name', case when p_internal then p.full_name else private.public_player_name(p) end, 'kind', e.goal_kind) order by e.occurrence_ms, e.created_at, e.id)
        from public.match_events e left join public.players p on p.id = e.scorer_player_id
        where e.match_id = p_match_id and e.side is not null and e.status = 'active' and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted'))
      ), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_ranka_match_details(text,uuid,text,boolean) from public;
grant execute on function public.get_ranka_match_details(text,uuid,text,boolean) to anon, authenticated;

commit;
