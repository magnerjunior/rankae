begin;

create function public.save_ranka_kits(p_ranka_id uuid, p_revision bigint, p_key uuid, p_yellow text, p_red text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.rankas%rowtype;
  choices constant text[] := array['yellow','red','blue','green','orange','purple','white','black','shirt','shirtless'];
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_key is null or p_yellow is null or p_red is null or p_yellow = p_red
    or not (p_yellow = any(choices) and p_red = any(choices)) then
    raise exception 'Invalid kits' using errcode = '22023';
  end if;
  select * into target from public.rankas where id = p_ranka_id for update;
  insert into private.workspace_command_receipts values (target.id, 'save_ranka_kits', p_key) on conflict do nothing;
  if not found then return; end if;
  if target.revision is distinct from p_revision then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
  update public.rankas set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{kits}',
    jsonb_build_object('yellow', p_yellow, 'red', p_red)), revision = revision + 1, updated_at = now()
  where id = target.id;
end;
$$;
revoke all on function public.save_ranka_kits(uuid,bigint,uuid,text,text) from public, anon;
grant execute on function public.save_ranka_kits(uuid,bigint,uuid,text,text) to authenticated;

create index matches_running_started_idx on public.matches (started_at_server)
  where state in ('live', 'overtime_live') and started_at_server is not null;

alter table public.audit_logs alter column actor_id drop not null;
alter table public.audit_logs add constraint audit_logs_actor_required
  check (actor_id is not null or action = 'clock_deadline');

create function private.apply_match_deadline(p_match_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  target public.matches%rowtype;
  deadline timestamptz;
  next_deadline timestamptz;
  score_diff integer;
  next_state public.match_state;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then return '{}'::jsonb; end if;
  deadline := target.started_at_server + greatest(0, target.duration_limit_ms - target.elapsed_ms_before_start) * interval '1 millisecond';
  if target.state not in ('live', 'overtime_live') or deadline is null or clock_timestamp() < deadline then
    return jsonb_build_object('changed', false, 'state', target.state);
  end if;
  select count(*) filter (where side = 'yellow') - count(*) filter (where side = 'red') into score_diff
    from public.match_events
    where match_id = target.id and status = 'active'
      and (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted'));

  if score_diff = 0 and target.state = 'live' and target.overtime_duration_ms > 0 then
    next_deadline := deadline + target.overtime_duration_ms * interval '1 millisecond';
    next_state := case when clock_timestamp() >= next_deadline then 'tie_break' else 'overtime_live' end;
    begin
      update public.matches set state = next_state, clock_phase = 'overtime',
        started_at_server = case when next_state = 'overtime_live' then deadline end,
        elapsed_ms_before_start = case when next_state = 'tie_break' then target.overtime_duration_ms else 0 end,
        duration_limit_ms = target.overtime_duration_ms, paused_at = null, revision = revision + 1, updated_at = now()
      where id = target.id;
    exception when sqlstate 'PT402' then
      -- Keep the account trial boundary enforced when a day expires during play.
      next_state := 'tie_break';
      update public.matches set state = next_state, elapsed_ms_before_start = duration_limit_ms,
        started_at_server = null, paused_at = null, revision = revision + 1, updated_at = now() where id = target.id;
    end;
  else
    next_state := case when score_diff = 0 then 'tie_break' else 'completed' end;
    update public.matches set state = next_state, elapsed_ms_before_start = duration_limit_ms,
      started_at_server = null, paused_at = null, ended_at = case when next_state = 'completed' then deadline end,
      revision = revision + 1, updated_at = now() where id = target.id;
  end if;
  if next_state = 'completed' then
    update public.sessions set revision = revision + 1, updated_at = now() where id = target.session_id;
  end if;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'clock_deadline', 'match', target.id,
    gen_random_uuid(), jsonb_build_object('state', target.state), jsonb_build_object('state', next_state, 'deadline', deadline));
  return jsonb_build_object('changed', true, 'state', next_state);
end;
$$;
revoke all on function private.apply_match_deadline(uuid) from public, anon, authenticated;

create function public.expire_match_clock(p_match_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ranka uuid;
begin
  select ranka_id into ranka from public.matches where id = p_match_id;
  if ranka is null or not private.can_manage_ranka(ranka) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return private.apply_match_deadline(p_match_id);
end;
$$;
revoke all on function public.expire_match_clock(uuid) from public, anon;
grant execute on function public.expire_match_clock(uuid) to authenticated;

create function private.process_match_deadlines() returns void
language plpgsql set search_path = '' as $$
declare match_id uuid;
begin
  for match_id in select id from public.matches
    where state in ('live', 'overtime_live') and started_at_server is not null
      and started_at_server <= now()
      and started_at_server + greatest(0, duration_limit_ms - elapsed_ms_before_start) * interval '1 millisecond' <= now()
    order by started_at_server limit 100 for update skip locked
  loop
    perform private.apply_match_deadline(match_id);
  end loop;
end;
$$;
revoke all on function private.process_match_deadlines() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rankae-match-deadlines', '10 seconds', 'select private.process_match_deadlines()');
select cron.schedule('rankae-prune-clock-job-history', '23 7 * * 1',
  $$delete from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'rankae-match-deadlines')
    and end_time < now() - interval '1 day'$$);

commit;
