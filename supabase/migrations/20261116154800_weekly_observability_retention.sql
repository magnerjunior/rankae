begin;

create table private.observability_daily (
  day date not null,
  route_key text not null,
  samples bigint not null,
  server_errors bigint not null,
  total_duration_ms bigint not null,
  primary key (day, route_key)
);
create table private.operational_retention_status (
  singleton boolean primary key default true check (singleton),
  ran_at timestamptz not null,
  archived_samples bigint not null,
  removed_attempts bigint not null,
  removed_grants bigint not null,
  removed_invites bigint not null
);
revoke all on private.observability_daily, private.operational_retention_status from public, anon, authenticated;

create index observability_route_samples_occurred_at_idx on public.observability_route_samples(occurred_at);
create index portal_access_attempts_attempted_at_idx on public.portal_access_attempts(attempted_at);
create index portal_access_grants_expires_at_idx on public.portal_access_grants(expires_at);

create function private.prune_operational_logs() returns void
language plpgsql set search_path = '' as $$
declare
  run_at timestamptz := now();
  archive_before timestamptz := (date_trunc('day', run_at at time zone 'UTC') at time zone 'UTC') - interval '30 days';
  samples bigint; attempts bigint; grants bigint; invites bigint;
begin
  with pruned as (
    delete from public.observability_route_samples where occurred_at < archive_before
    returning (occurred_at at time zone 'UTC')::date as day, route_key, status_code, duration_ms
  ), archived as (
    insert into private.observability_daily(day, route_key, samples, server_errors, total_duration_ms)
    select day, route_key, count(*), count(*) filter (where status_code >= 500), sum(duration_ms)
    from pruned group by day, route_key
    on conflict (day, route_key) do update set samples = private.observability_daily.samples + excluded.samples,
      server_errors = private.observability_daily.server_errors + excluded.server_errors,
      total_duration_ms = private.observability_daily.total_duration_ms + excluded.total_duration_ms
  ) select count(*) into samples from pruned;

  delete from public.portal_access_attempts where attempted_at < run_at - interval '14 days';
  get diagnostics attempts = row_count;
  delete from public.portal_access_grants where expires_at < run_at - interval '30 days';
  get diagnostics grants = row_count;
  delete from private.team_invites where expires_at < run_at - interval '30 days';
  get diagnostics invites = row_count;
  delete from private.observability_daily where day < (run_at at time zone 'UTC')::date - 365;

  insert into private.operational_retention_status(ran_at, archived_samples, removed_attempts, removed_grants, removed_invites)
  values (run_at, samples, attempts, grants, invites)
  on conflict (singleton) do update set ran_at = excluded.ran_at, archived_samples = excluded.archived_samples,
    removed_attempts = excluded.removed_attempts, removed_grants = excluded.removed_grants, removed_invites = excluded.removed_invites;
end;
$$;

create function public.admin_get_retention_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object('ranAt', ran_at, 'archivedSamples', archived_samples,
    'removedAttempts', removed_attempts, 'removedGrants', removed_grants, 'removedInvites', removed_invites)
    from private.operational_retention_status where singleton);
end;
$$;

revoke all on function private.prune_operational_logs() from public, anon, authenticated;
revoke all on function public.admin_get_retention_status() from public, anon;
grant execute on function public.admin_get_retention_status() to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('rankae-weekly-observability-retention', '17 7 * * 1', 'select private.prune_operational_logs();');

commit;
