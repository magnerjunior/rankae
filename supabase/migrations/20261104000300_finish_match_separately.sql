begin;

create function public.finish_match(p_match_id uuid, p_expected_revision bigint, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; elapsed bigint;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where match_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('match_id', target.id, 'revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if target.state not in ('live', 'paused', 'regulation_ended', 'overtime_live', 'overtime_paused', 'tie_break') then
    raise exception 'Match cannot be finished from this state' using errcode = '55000';
  end if;
  elapsed := private.current_match_elapsed(target);
  update public.matches set state = 'completed', elapsed_ms_before_start = elapsed, started_at_server = null,
    ended_at = clock_timestamp(), revision = revision + 1, updated_at = now() where id = target.id;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'finish_match', 'match', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('state', target.state, 'elapsed_ms_before_start', target.elapsed_ms_before_start),
    jsonb_build_object('state', 'completed', 'elapsed_ms_before_start', elapsed));
  return jsonb_build_object('match_id', target.id, 'revision', target.revision + 1, 'state', 'completed');
end;
$$;
revoke all on function public.finish_match(uuid,bigint,uuid) from public, anon;
grant execute on function public.finish_match(uuid,bigint,uuid) to authenticated;

create function public.adjust_match_clock(p_match_id uuid, p_add_ms integer, p_expected_revision bigint, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype; elapsed bigint; new_elapsed bigint; current_start timestamptz;
begin
  if p_add_ms not between 1000 and 600000 then raise exception 'Invalid adjustment' using errcode = '22023'; end if;
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where match_id = target.id and idempotency_key = p_idempotency_key) then
    return to_jsonb(target) || jsonb_build_object('server_now', clock_timestamp(), 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if target.state not in ('live', 'paused', 'overtime_live', 'overtime_paused') then raise exception 'Clock is not running' using errcode = '55000'; end if;
  elapsed := private.current_match_elapsed(target);
  new_elapsed := elapsed;
  current_start := case when target.state in ('live', 'overtime_live') then clock_timestamp() else null end;
  update public.matches set elapsed_ms_before_start = new_elapsed, started_at_server = current_start, duration_limit_ms = least(7200000, target.duration_limit_ms + p_add_ms),
    revision = revision + 1, updated_at = now() where id = target.id;
  select * into target from public.matches where id = p_match_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'adjust_clock', 'match', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('added_ms', p_add_ms, 'elapsed_ms_before_start', new_elapsed));
  return to_jsonb(target) || jsonb_build_object('server_now', clock_timestamp());
end;
$$;
revoke all on function public.adjust_match_clock(uuid,integer,bigint,uuid) from public, anon;
grant execute on function public.adjust_match_clock(uuid,integer,bigint,uuid) to authenticated;

create function public.update_goal_attribution(p_event_id uuid, p_scorer_player_id uuid, p_assist_player_id uuid, p_expected_revision bigint, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.match_events%rowtype; target_match public.matches%rowtype;
begin
  if p_scorer_player_id is not null and p_scorer_player_id = p_assist_player_id then raise exception 'Scorer and assist must differ' using errcode = '22023'; end if;
  select * into target from public.match_events where id = p_event_id and event_type = 'goal' and status = 'active' for update;
  if target.id is null then raise exception 'Goal not found' using errcode = 'P0002'; end if;
  select * into target_match from public.matches where id = target.match_id for update;
  if not private.can_manage_ranka(target_match.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where match_id = target.match_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('match_revision', target_match.revision, 'idempotent', true);
  end if;
  if target_match.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target_match.revision::text; end if;
  if p_scorer_player_id is not null and not exists (select 1 from public.match_assignments where match_id = target.match_id and player_id = p_scorer_player_id and field_side = case when target.goal_kind = 'own_goal' then case when target.side = 'yellow' then 'red'::public.field_side else 'yellow'::public.field_side end else target.side end and status <> 'cancelled') then raise exception 'Scorer must belong to the correct side' using errcode = '23503'; end if;
  if p_assist_player_id is not null and not exists (select 1 from public.match_assignments where match_id = target.match_id and player_id = p_assist_player_id and field_side = target.side and status <> 'cancelled') then raise exception 'Assist must belong to the scoring side' using errcode = '23503'; end if;
  update public.match_events set scorer_player_id = p_scorer_player_id, assist_player_id = p_assist_player_id, version = version + 1 where id = target.id;
  update public.matches set revision = revision + 1, updated_at = now() where id = target_match.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target_match.ranka_id, target.session_id, target.match_id, 'update_goal_attribution', 'match_event', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('scorer_player_id', target.scorer_player_id, 'assist_player_id', target.assist_player_id),
    jsonb_build_object('scorer_player_id', p_scorer_player_id, 'assist_player_id', p_assist_player_id));
  return jsonb_build_object('match_revision', target_match.revision + 1);
end;
$$;
revoke all on function public.update_goal_attribution(uuid,uuid,uuid,bigint,uuid) from public, anon;
grant execute on function public.update_goal_attribution(uuid,uuid,uuid,bigint,uuid) to authenticated;

create function private.default_match_goal_rule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.rules_snapshot ->> 'targetGoalsConfigured', 'false') <> 'true' and
     coalesce((new.rules_snapshot ->> 'targetGoals')::integer, 0) = 0 then
    new.rules_snapshot := jsonb_set(new.rules_snapshot, '{targetGoals}', '2'::jsonb, true);
  end if;
  return new;
end;
$$;
create trigger sessions_default_goal_rule before insert on public.sessions for each row execute function private.default_match_goal_rule();

alter function public.complete_match_and_rotate(uuid,text,text,bigint,uuid) rename to rotate_completed_match_legacy;
revoke all on function public.rotate_completed_match_legacy(uuid,text,text,bigint,uuid) from public, anon, authenticated;
create function public.complete_match_and_rotate(p_match_id uuid, p_result_override text, p_reason text, p_expected_revision bigint, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.state <> 'completed' then raise exception 'Finish the match first' using errcode = '55000'; end if;
  if exists (select 1 from public.audit_logs where match_id = target.id and action = 'complete_and_rotate' and idempotency_key <> p_idempotency_key) then raise exception 'Next match was already prepared' using errcode = '55000'; end if;
  if exists (select 1 from public.matches where session_id = target.session_id and id <> target.id and state not in ('completed', 'cancelled')) then raise exception 'Another match is active' using errcode = '55000'; end if;
  return public.rotate_completed_match_legacy(p_match_id,p_result_override,p_reason,p_expected_revision,p_idempotency_key);
end;
$$;
revoke all on function public.complete_match_and_rotate(uuid,text,text,bigint,uuid) from public, anon;
grant execute on function public.complete_match_and_rotate(uuid,text,text,bigint,uuid) to authenticated;

commit;
