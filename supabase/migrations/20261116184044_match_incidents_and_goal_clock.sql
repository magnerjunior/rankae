begin;

create function private.pause_clock_at_scoring_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  game public.matches%rowtype;
  rules jsonb;
  yellow_score integer;
  red_score integer;
  target_goals integer;
  goal_difference integer;
  reached_before boolean;
begin
  select * into game from public.matches where id = new.match_id for update;
  if new.event_type = 'goal' and new.metadata ? 'clockStartedAt' then
    if (to_jsonb(game.started_at_server) #>> '{}') is distinct from (new.metadata->>'clockStartedAt') then
      raise exception 'Clock segment changed' using errcode = 'PT412';
    end if;
    if game.started_at_server is not null and new.metadata->>'capturedElapsedMs' ~ '^[0-9]{1,8}$' then
      new.occurrence_ms := greatest(game.elapsed_ms_before_start,
        least(new.occurrence_ms, (new.metadata->>'capturedElapsedMs')::bigint));
    end if;
  end if;
  if game.state not in ('live','overtime_live') then return new; end if;
  select rules_snapshot into rules from public.sessions where id = game.session_id;
  target_goals := case when rules->>'targetGoals' ~ '^[0-9]{1,3}$' then (rules->>'targetGoals')::integer else 0 end;
  goal_difference := case when rules->>'targetGoalDifference' ~ '^[0-9]{1,3}$' then (rules->>'targetGoalDifference')::integer else 0 end;
  if target_goals = 0 and goal_difference = 0 then return new; end if;
  select count(*) filter (where side = 'yellow'), count(*) filter (where side = 'red')
  into yellow_score, red_score from public.match_events
  where match_id = new.match_id and status = 'active' and
    (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted'));
  reached_before := yellow_score <> red_score and
    ((target_goals > 0 and greatest(yellow_score, red_score) >= target_goals) or
     (goal_difference > 0 and abs(yellow_score - red_score) >= goal_difference));
  yellow_score := yellow_score + (new.side = 'yellow')::integer;
  red_score := red_score + (new.side = 'red')::integer;
  if not reached_before and yellow_score <> red_score and
    ((target_goals > 0 and greatest(yellow_score, red_score) >= target_goals) or
     (goal_difference > 0 and abs(yellow_score - red_score) >= goal_difference)) then
    update public.matches set state = case when game.state = 'overtime_live' then 'overtime_paused'::public.match_state else 'paused'::public.match_state end,
      started_at_server = null, elapsed_ms_before_start = new.occurrence_ms, paused_at = clock_timestamp(), updated_at = now()
    where id = game.id;
  end if;
  return new;
end;
$$;
revoke all on function private.pause_clock_at_scoring_limit() from public, anon, authenticated;
create trigger match_goal_clock_limit before insert on public.match_events for each row
when (new.status = 'active' and (new.event_type = 'goal' or (new.event_type = 'penalty_attempt' and new.penalty_outcome = 'converted')))
execute function private.pause_clock_at_scoring_limit();

create function public.record_player_match_card(p_match_id uuid, p_player_id uuid, p_color text, p_revision bigint, p_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  game public.matches%rowtype;
  assignment public.match_assignments%rowtype;
  saved jsonb;
  caption text;
begin
  if p_color is null or p_color not in ('yellow','red') or p_key is null then
    raise exception 'Invalid card' using errcode = '22023';
  end if;
  select * into game from public.matches where id = p_match_id for update;
  if game.id is null or not private.can_manage_ranka(game.ranka_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.match_events where match_id = game.id and idempotency_key = p_key) then
    return jsonb_build_object('match_revision', game.revision, 'idempotent', true);
  end if;
  if game.state not in ('live','paused','overtime_live','overtime_paused') then
    raise exception 'Match is not accepting cards' using errcode = '55000';
  end if;
  select * into assignment from public.match_assignments where match_id = game.id
    and player_id = p_player_id and field_side is not null and status <> 'cancelled' and end_ms is null;
  if assignment.id is null then raise exception 'Player is not on the pitch' using errcode = '55000'; end if;
  select left((case when p_color = 'red' then 'Cartão vermelho' else 'Cartão amarelo' end) || ' · ' || full_name, 80)
    into caption from public.players where id = p_player_id;
  saved := public.record_match_event(game.id, 'marker', null, p_player_id, null, null, null, null, caption,
    jsonb_build_object('kind','card','color',p_color,'playerId',p_player_id,
      'ejectedAssignmentId',case when p_color = 'red' then assignment.id end), p_revision, p_key);
  if p_color = 'red' then
    update public.match_assignments set end_ms = greatest(start_ms,(saved->>'occurrence_ms')::bigint) where id = assignment.id;
  end if;
  return saved;
end;
$$;
revoke all on function public.record_player_match_card(uuid,uuid,text,bigint,uuid) from public, anon;
grant execute on function public.record_player_match_card(uuid,uuid,text,bigint,uuid) to authenticated;

create function private.restore_voided_red_card() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.matches where id = old.match_id and state in ('live','paused','overtime_live','overtime_paused')) then
    raise exception 'Match is no longer in play' using errcode = '55000';
  end if;
  update public.match_assignments set end_ms = null
  where id::text = old.metadata->>'ejectedAssignmentId' and match_id = old.match_id and status <> 'cancelled';
  return new;
end;
$$;
revoke all on function private.restore_voided_red_card() from public, anon, authenticated;
create trigger match_red_card_correction before update of status on public.match_events for each row
when (old.status = 'active' and new.status = 'void' and old.metadata->>'ejectedAssignmentId' is not null)
execute function private.restore_voided_red_card();

commit;
