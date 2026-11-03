begin;

alter table public.observability_route_samples
  drop constraint if exists observability_route_samples_route_key_check;

alter table public.observability_route_samples
  add constraint observability_route_samples_route_key_check
  check (route_key in (
    'public_snapshot',
    'record_match_event',
    'transition_match_clock',
    'generate_session_squads',
    'prepare_next_match',
    'complete_match_and_rotate',
    'batch_mark_contributions',
    'finish_ranka_session'
  ));

create or replace function private.record_route_sample(p_route_key text, p_duration_ms integer, p_status_code integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_route_key not in (
    'public_snapshot',
    'record_match_event',
    'transition_match_clock',
    'generate_session_squads',
    'prepare_next_match',
    'complete_match_and_rotate',
    'batch_mark_contributions',
    'finish_ranka_session'
  ) then return; end if;
  insert into public.observability_route_samples(route_key, duration_ms, status_code)
  values (p_route_key, greatest(0, least(p_duration_ms, 300000)), p_status_code);
exception when others then
  null;
end;
$$;

revoke all on function private.record_route_sample(text, integer, integer) from public, anon, authenticated;

create or replace function public.record_authenticated_route_outcome(
  p_route_key text,
  p_duration_ms integer,
  p_status_code integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_route_key not in (
    'record_match_event',
    'transition_match_clock',
    'generate_session_squads',
    'prepare_next_match',
    'complete_match_and_rotate',
    'batch_mark_contributions',
    'finish_ranka_session'
  ) then
    raise exception 'Route is not eligible for authenticated telemetry' using errcode = '22023';
  end if;
  if p_status_code not in (200, 409, 500) then
    raise exception 'Unsupported status code' using errcode = '22023';
  end if;
  perform private.record_route_sample(p_route_key, p_duration_ms, p_status_code);
end;
$$;

revoke all on function public.record_authenticated_route_outcome(text, integer, integer) from public, anon;
grant execute on function public.record_authenticated_route_outcome(text, integer, integer) to authenticated;

create or replace function public.platform_health_check()
returns jsonb
language sql
security definer
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'ok',
    'database', 'reachable',
    'serverTime', clock_timestamp(),
    'schemaVersion', '20261103001600'
  );
$$;

revoke all on function public.platform_health_check() from public;
grant execute on function public.platform_health_check() to anon, authenticated;

commit;
