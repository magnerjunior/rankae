-- Snapshot autoritativo para o cronômetro e encerramento seguro do ranka do dia.
create function public.get_match_clock_snapshot(p_match_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = p_match_id;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'match_id', target.id,
    'state', target.state,
    'started_at_server', target.started_at_server,
    'elapsed_ms_before_start', target.elapsed_ms_before_start,
    'duration_limit_ms', target.duration_limit_ms,
    'revision', target.revision,
    'server_now', clock_timestamp()
  );
end;
$$;

revoke all on function public.get_match_clock_snapshot(uuid) from public, anon;
grant execute on function public.get_match_clock_snapshot(uuid) to authenticated;

create function public.finish_ranka_session(p_session_id uuid, p_expected_revision bigint, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_id', target.id, 'session_revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (
    select 1 from public.matches
    where session_id = target.id and state not in ('ready', 'draft', 'completed', 'cancelled')
  ) then raise exception 'Finish the active match first' using errcode = '55000'; end if;

  update public.matches
  set state = 'cancelled', ended_at = clock_timestamp(), started_at_server = null, revision = revision + 1, updated_at = now()
  where session_id = target.id and state in ('ready', 'draft');

  update public.sessions set state = 'completed', revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'finish_session', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('state', 'completed'));
  return jsonb_build_object('session_id', target.id, 'session_revision', target.revision + 1, 'state', 'completed');
end;
$$;

revoke all on function public.finish_ranka_session(uuid, bigint, uuid) from public, anon;
grant execute on function public.finish_ranka_session(uuid, bigint, uuid) to authenticated;
