begin;

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null check (document_key in ('terms', 'privacy', 'cookies', 'organizer_responsibility')),
  version integer not null check (version > 0),
  title text not null check (char_length(trim(title)) between 3 and 160),
  body_markdown text not null check (char_length(trim(body_markdown)) >= 100),
  status text not null default 'draft' check (status in ('draft', 'legal_review', 'published', 'retired')),
  effective_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_key, version),
  check (status <> 'published' or (effective_at is not null and reviewed_at is not null and reviewed_by is not null))
);

create unique index legal_documents_one_published_idx
  on public.legal_documents(document_key) where status = 'published';

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  document_key text not null,
  document_version integer not null,
  acceptance_context jsonb not null default '{"channel":"web","locale":"pt-BR"}'::jsonb
    check (jsonb_typeof(acceptance_context) = 'object'),
  idempotency_key uuid not null,
  accepted_at timestamptz not null default now(),
  unique (document_id, user_id),
  unique (user_id, idempotency_key)
);

create index legal_acceptances_user_idx on public.legal_acceptances(user_id, accepted_at desc);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  player_id uuid references public.players(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('access', 'correction', 'deletion', 'public_withdrawal')),
  description text not null check (char_length(trim(description)) between 10 and 1200),
  status text not null default 'received' check (status in ('received', 'verifying', 'in_progress', 'completed', 'rejected')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1200),
  idempotency_key uuid not null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_user_id, idempotency_key)
);

create index privacy_requests_org_status_idx on public.privacy_requests(org_id, status, created_at desc);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default true,
  mfa_required boolean not null default true check (mfa_required),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create table public.privileged_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(action) between 3 and 100),
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  resource_type text,
  resource_id uuid,
  outcome text not null check (outcome in ('allowed', 'denied', 'completed', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index privileged_access_audit_actor_time_idx on public.privileged_access_audit(actor_id, occurred_at desc);

create table public.observability_route_samples (
  id bigint generated always as identity primary key,
  route_key text not null check (route_key in ('public_snapshot', 'record_match_event', 'transition_match_clock')),
  duration_ms integer not null check (duration_ms between 0 and 300000),
  status_code integer not null check (status_code between 100 and 599),
  occurred_at timestamptz not null default clock_timestamp()
);

create index observability_route_samples_route_time_idx
  on public.observability_route_samples(route_key, occurred_at desc);

create table public.incident_records (
  id uuid primary key default gen_random_uuid(),
  incident_kind text not null check (incident_kind in ('latency', 'error_rate', 'database', 'realtime', 'security', 'manual')),
  severity text not null check (severity in ('warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  title text not null check (char_length(trim(title)) between 5 and 180),
  route_key text,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index incident_records_status_time_idx on public.incident_records(status, last_seen_at desc);

create function private.has_platform_admin_role()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid()) and pa.active
  );
$$;

create function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_platform_admin_role()
    and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.has_platform_admin_role() from public, anon, authenticated;
revoke all on function private.is_platform_admin() from public, anon, authenticated;

create function public.get_platform_admin_capability()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'active', private.has_platform_admin_role(),
    'aal2', coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
  );
$$;

revoke all on function public.get_platform_admin_capability() from public, anon;
grant execute on function public.get_platform_admin_capability() to authenticated;

create function public.get_pending_legal_documents()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'key', d.document_key,
    'version', d.version,
    'title', d.title,
    'body', d.body_markdown,
    'effectiveAt', d.effective_at
  ) order by d.document_key), '[]'::jsonb)
  from public.legal_documents d
  where (select auth.uid()) is not null
    and d.status = 'published'
    and d.effective_at <= now()
    and d.document_key in ('terms', 'privacy', 'organizer_responsibility')
    and not exists (
      select 1 from public.legal_acceptances a
      where a.document_id = d.id and a.user_id = (select auth.uid())
    );
$$;

revoke all on function public.get_pending_legal_documents() from public, anon;
grant execute on function public.get_pending_legal_documents() to authenticated;

create function public.accept_legal_document(
  p_document_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.legal_documents%rowtype;
  accepted public.legal_acceptances%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into target from public.legal_documents where id = p_document_id;
  if target.id is null or target.status <> 'published' or target.effective_at > now() then
    raise exception 'Document unavailable' using errcode = 'P0002';
  end if;
  if target.version <> p_expected_version then
    raise exception 'Document version changed' using errcode = '40001';
  end if;
  insert into public.legal_acceptances (
    document_id, user_id, document_key, document_version, idempotency_key
  ) values (target.id, actor_id, target.document_key, target.version, p_idempotency_key)
  on conflict (document_id, user_id) do nothing
  returning * into accepted;
  return jsonb_build_object('accepted', true, 'document_id', target.id, 'version', target.version);
end;
$$;

revoke all on function public.accept_legal_document(uuid, integer, uuid) from public, anon;
grant execute on function public.accept_legal_document(uuid, integer, uuid) to authenticated;

create function public.create_privacy_request(
  p_org_id uuid,
  p_player_id uuid,
  p_request_type text,
  p_description text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare created public.privacy_requests%rowtype;
begin
  if not private.can_manage_org(p_org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_request_type not in ('access', 'correction', 'deletion', 'public_withdrawal') then
    raise exception 'Invalid request type' using errcode = '22023';
  end if;
  if p_player_id is not null and not exists (
    select 1 from public.players where id = p_player_id and org_id = p_org_id
  ) then raise exception 'Player does not belong to organization' using errcode = '23503'; end if;
  insert into public.privacy_requests (
    org_id, player_id, requester_user_id, request_type, description, idempotency_key
  ) values (
    p_org_id, p_player_id, (select auth.uid()), p_request_type, trim(p_description), p_idempotency_key
  )
  returning * into created;
  return jsonb_build_object('id', created.id, 'status', created.status, 'created_at', created.created_at);
end;
$$;

revoke all on function public.create_privacy_request(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.create_privacy_request(uuid, uuid, text, text, uuid) to authenticated;

create function public.list_privacy_requests(p_org_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'requestType', r.request_type,
    'status', r.status,
    'description', r.description,
    'resolutionNote', r.resolution_note,
    'playerId', r.player_id,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  ) order by r.created_at desc), '[]'::jsonb)
  from public.privacy_requests r
  where r.org_id = p_org_id
    and (r.requester_user_id = (select auth.uid()) or private.can_manage_org(p_org_id));
$$;

revoke all on function public.list_privacy_requests(uuid) from public, anon;
grant execute on function public.list_privacy_requests(uuid) to authenticated;

create function public.resolve_privacy_request(
  p_request_id uuid,
  p_resolution_status text,
  p_resolution_note text,
  p_replacement_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.privacy_requests%rowtype;
  actor_id uuid := (select auth.uid());
begin
  select * into target from public.privacy_requests where id = p_request_id for update;
  if target.id is null then raise exception 'Privacy request not found' using errcode = 'P0002'; end if;
  if not private.can_manage_org(target.org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target.status in ('completed', 'rejected') then raise exception 'Privacy request already closed' using errcode = '22023'; end if;
  if p_resolution_status not in ('completed', 'rejected') or char_length(trim(p_resolution_note)) < 10 then
    raise exception 'Resolution status and note are required' using errcode = '22023';
  end if;

  if p_resolution_status = 'completed' and target.request_type = 'correction' then
    if target.player_id is null or char_length(trim(coalesce(p_replacement_name, ''))) < 2 then
      raise exception 'Correction requires a player and replacement name' using errcode = '22023';
    end if;
    update public.players set full_name = trim(p_replacement_name), revision = revision + 1, updated_at = now()
    where id = target.player_id and org_id = target.org_id;
  elsif p_resolution_status = 'completed' and target.request_type = 'public_withdrawal' and target.player_id is not null then
    update public.players set public_visible = false, public_display_name = null, revision = revision + 1, updated_at = now()
    where id = target.player_id and org_id = target.org_id;
  elsif p_resolution_status = 'completed' and target.request_type = 'deletion' and target.player_id is not null then
    delete from public.player_aliases where player_id = target.player_id and org_id = target.org_id;
    update public.players set
      full_name = 'Participante removido', nickname = null, status = 'hidden', public_visible = false,
      public_display_name = null, revision = revision + 1, updated_at = now()
    where id = target.player_id and org_id = target.org_id;
  end if;

  update public.privacy_requests set
    status = p_resolution_status,
    resolution_note = trim(p_resolution_note),
    resolved_by = actor_id,
    resolved_at = now(),
    updated_at = now()
  where id = target.id;
  return jsonb_build_object('id', target.id, 'status', p_resolution_status, 'resolved', true);
end;
$$;

revoke all on function public.resolve_privacy_request(uuid, text, text, text) from public, anon;
grant execute on function public.resolve_privacy_request(uuid, text, text, text) to authenticated;

create function private.record_route_sample(p_route_key text, p_duration_ms integer, p_status_code integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_route_key not in ('public_snapshot', 'record_match_event', 'transition_match_clock') then return; end if;
  insert into public.observability_route_samples(route_key, duration_ms, status_code)
  values (p_route_key, greatest(0, least(p_duration_ms, 300000)), p_status_code);
exception when others then
  null;
end;
$$;

revoke all on function private.record_route_sample(text, integer, integer) from public, anon, authenticated;

create function private.evaluate_route_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  previous_count integer;
  current_p95 numeric;
  previous_p95 numeric;
  current_error_rate numeric;
  severity_value text;
begin
  select count(*), percentile_cont(0.95) within group (order by duration_ms),
         count(*) filter (where status_code >= 500)::numeric / nullif(count(*), 0)
    into current_count, current_p95, current_error_rate
  from public.observability_route_samples
  where route_key = new.route_key and occurred_at >= clock_timestamp() - interval '5 minutes';

  if current_count < 50 then return new; end if;

  select count(*), percentile_cont(0.95) within group (order by duration_ms)
    into previous_count, previous_p95
  from public.observability_route_samples
  where route_key = new.route_key
    and occurred_at >= clock_timestamp() - interval '10 minutes'
    and occurred_at < clock_timestamp() - interval '5 minutes';

  if current_error_rate > 0.01 then
    insert into public.incident_records(incident_kind, severity, title, route_key, evidence)
    select 'error_rate', 'critical', 'Taxa de erro 5xx acima de 1%', new.route_key,
      jsonb_build_object('windowMinutes', 5, 'samples', current_count, 'errorRate', round(current_error_rate, 4))
    where not exists (
      select 1 from public.incident_records i where i.status <> 'resolved'
        and i.incident_kind = 'error_rate' and i.route_key = new.route_key
        and i.last_seen_at >= clock_timestamp() - interval '15 minutes'
    );
  end if;

  if previous_count >= 50 and current_p95 > 1000 and previous_p95 > 1000 then
    severity_value := case when current_p95 > 2000 then 'critical' else 'warning' end;
    insert into public.incident_records(incident_kind, severity, title, route_key, evidence)
    select 'latency', severity_value, 'p95 acima de 1 segundo em duas janelas', new.route_key,
      jsonb_build_object('windowMinutes', 5, 'samples', current_count, 'p95Ms', round(current_p95), 'previousP95Ms', round(previous_p95))
    where not exists (
      select 1 from public.incident_records i where i.status <> 'resolved'
        and i.incident_kind = 'latency' and i.route_key = new.route_key
        and i.last_seen_at >= clock_timestamp() - interval '15 minutes'
    );
  end if;
  return new;
end;
$$;

create trigger observability_route_alert
after insert on public.observability_route_samples
for each row execute function private.evaluate_route_alert();

create function public.platform_health_check()
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
    'schemaVersion', '20261103000500'
  );
$$;

revoke all on function public.platform_health_check() from public;
grant execute on function public.platform_health_check() to anon, authenticated;

create function public.get_platform_admin_overview(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result jsonb;
begin
  if not private.is_platform_admin() then
    if actor_id is not null then
      insert into public.privileged_access_audit(actor_id, action, reason, outcome)
      values (actor_id, 'platform_overview', left(coalesce(nullif(trim(p_reason), ''), 'Motivo não informado'), 500), 'denied');
    end if;
    raise exception 'AAL2 platform administrator required' using errcode = '42501';
  end if;
  if char_length(trim(p_reason)) < 8 then raise exception 'Access reason required' using errcode = '22023'; end if;

  select jsonb_build_object(
    'counts', jsonb_build_object(
      'organizations', (select count(*) from public.organizations),
      'rankas', (select count(*) from public.rankas),
      'openPrivacyRequests', (select count(*) from public.privacy_requests where status not in ('completed', 'rejected')),
      'openIncidents', (select count(*) from public.incident_records where status <> 'resolved')
    ),
    'metrics', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.route_key) from (
        select route_key,
          count(*)::integer as samples,
          round(percentile_cont(0.50) within group (order by duration_ms))::integer as "p50Ms",
          round(percentile_cont(0.95) within group (order by duration_ms))::integer as "p95Ms",
          round(percentile_cont(0.99) within group (order by duration_ms))::integer as "p99Ms",
          round((count(*) filter (where status_code >= 500)::numeric / nullif(count(*), 0)) * 100, 2) as "errorPercent"
        from public.observability_route_samples
        where occurred_at >= clock_timestamp() - interval '1 hour'
        group by route_key
      ) m
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.incident_kind, 'severity', i.severity, 'status', i.status,
        'title', i.title, 'routeKey', i.route_key, 'evidence', i.evidence, 'lastSeenAt', i.last_seen_at
      ) order by i.last_seen_at desc)
      from (select * from public.incident_records order by last_seen_at desc limit 20) i
    ), '[]'::jsonb)
  ) into result;

  insert into public.privileged_access_audit(actor_id, action, reason, outcome, metadata)
  values (actor_id, 'platform_overview', trim(p_reason), 'allowed', '{"projection":"aggregate_only"}'::jsonb);
  return result;
end;
$$;

revoke all on function public.get_platform_admin_overview(text) from public, anon;
grant execute on function public.get_platform_admin_overview(text) to authenticated;

create function public.admin_resolve_incident(p_incident_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.is_platform_admin() then raise exception 'AAL2 platform administrator required' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) < 8 then raise exception 'Resolution reason required' using errcode = '22023'; end if;
  update public.incident_records set status = 'resolved', resolved_by = actor_id, resolved_at = now(), last_seen_at = now()
  where id = p_incident_id;
  if not found then raise exception 'Incident not found' using errcode = 'P0002'; end if;
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome)
  values (actor_id, 'resolve_incident', trim(p_reason), 'incident', p_incident_id, 'completed');
  return jsonb_build_object('resolved', true, 'id', p_incident_id);
end;
$$;

revoke all on function public.admin_resolve_incident(uuid, text) from public, anon;
grant execute on function public.admin_resolve_incident(uuid, text) to authenticated;

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.platform_admins enable row level security;
alter table public.privileged_access_audit enable row level security;
alter table public.observability_route_samples enable row level security;
alter table public.incident_records enable row level security;

revoke all on public.legal_documents, public.legal_acceptances, public.privacy_requests,
  public.platform_admins, public.privileged_access_audit, public.observability_route_samples,
  public.incident_records from public, anon, authenticated;

grant select on public.legal_acceptances to authenticated;
create policy legal_acceptances_own_select on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.privacy_requests to authenticated;
create policy privacy_requests_authorized_select on public.privacy_requests for select to authenticated
  using (requester_user_id = (select auth.uid()) or private.can_manage_org(org_id));

create index if not exists audit_logs_org_created_idx on public.audit_logs(org_id, created_at desc);
create index if not exists match_events_active_match_idx on public.match_events(match_id, event_type, side) where status = 'active';
create index if not exists players_public_visible_org_idx on public.players(org_id) where public_visible;

alter function public.get_public_ranka_snapshot(text, text, text, date)
  rename to get_public_ranka_snapshot_phase3;
revoke all on function public.get_public_ranka_snapshot_phase3(text, text, text, date) from public, anon, authenticated;

create function public.get_public_ranka_snapshot(
  p_slug text,
  p_grant_token text default null,
  p_period text default 'last',
  p_specific_date date default null
)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare started_at timestamptz := clock_timestamp(); result jsonb;
begin
  result := public.get_public_ranka_snapshot_phase3(p_slug, p_grant_token, p_period, p_specific_date);
  perform private.record_route_sample('public_snapshot', (extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer, 200);
  return result;
exception when others then
  perform private.record_route_sample('public_snapshot', (extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer, 500);
  raise;
end;
$$;

revoke all on function public.get_public_ranka_snapshot(text, text, text, date) from public;
grant execute on function public.get_public_ranka_snapshot(text, text, text, date) to anon, authenticated;

create function public.record_authenticated_route_outcome(
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
  if p_route_key not in ('record_match_event', 'transition_match_clock') then
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

commit;
