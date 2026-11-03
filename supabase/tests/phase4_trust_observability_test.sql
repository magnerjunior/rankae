begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

select has_table('public', 'legal_documents', 'legal documents are versioned in the database');
select has_table('public', 'legal_acceptances', 'legal acceptances are auditable');
select has_table('public', 'privacy_requests', 'privacy requests have a dedicated workflow');
select has_table('public', 'platform_admins', 'platform admin role is separate from organization roles');
select has_table('public', 'observability_route_samples', 'critical route samples are stored without personal payloads');
select has_table('public', 'incident_records', 'operational incidents are persisted');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('61000000-0000-0000-0000-000000000001', 'phase4-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('61000000-0000-0000-0000-000000000002', 'phase4-outsider@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, owner_user_id)
values
  ('6a000000-0000-0000-0000-000000000001', 'Organização Confiança', '61000000-0000-0000-0000-000000000001'),
  ('6a000000-0000-0000-0000-000000000002', 'Organização Externa', '61000000-0000-0000-0000-000000000002');

insert into public.players (id, org_id, full_name)
values ('62000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'Participante de Teste');

insert into public.legal_documents (
  id, document_key, version, title, body_markdown, status, effective_at, reviewed_at, reviewed_by, created_by
) values (
  '63000000-0000-0000-0000-000000000001', 'terms', 1, 'Termos revisados de teste',
  repeat('Conteúdo jurídico revisado exclusivamente para teste transacional. ', 3),
  'published', now() - interval '1 minute', now(), '61000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);

select results_eq(
  $$select jsonb_array_length(public.get_pending_legal_documents())$$,
  array[1],
  'published required document is pending before acceptance'
);

select lives_ok(
  $$select public.accept_legal_document('63000000-0000-0000-0000-000000000001', 1, '64000000-0000-0000-0000-000000000001')$$,
  'authenticated organizer records a versioned acceptance'
);

select results_eq(
  $$select jsonb_array_length(public.get_pending_legal_documents())$$,
  array[0],
  'accepted document is no longer pending'
);

select lives_ok(
  $$select public.create_privacy_request('6a000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'correction', 'Corrigir o apelido esportivo após confirmação de identidade.', '64000000-0000-0000-0000-000000000002')$$,
  'organizer creates an auditable privacy request for own organization'
);

select results_eq(
  $$select jsonb_array_length(public.list_privacy_requests('6a000000-0000-0000-0000-000000000001'))$$,
  array[1],
  'authorized organization lists its privacy request'
);

select lives_ok(
  $$select public.resolve_privacy_request((select id from public.privacy_requests where org_id = '6a000000-0000-0000-0000-000000000001'), 'completed', 'Identidade confirmada e nome corrigido conforme solicitação.', 'Participante Corrigido')$$,
  'authorized organizer resolves correction and applies the requested change'
);

select results_eq(
  $$select full_name from public.players where id = '62000000-0000-0000-0000-000000000001'$$,
  array['Participante Corrigido'],
  'resolved correction updates only the linked player'
);

select is(
  (public.get_platform_admin_capability()->>'active')::boolean,
  false,
  'ordinary organization owner is not a platform admin'
);

reset role;
insert into public.platform_admins(user_id, created_by)
values ('61000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is((public.get_platform_admin_capability()->>'aal2')::boolean, false, 'admin capability reports missing MFA at AAL1');

select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
select is((public.get_platform_admin_capability()->>'aal2')::boolean, true, 'verified TOTP session reaches AAL2');
select lives_ok($$select public.get_platform_admin_overview('Teste automatizado do painel agregado')$$, 'AAL2 admin reads aggregate overview');
select lives_ok($$select public.record_authenticated_route_outcome('complete_match_and_rotate', 250, 200)$$, 'rotation telemetry accepts the phase 2 critical route');
reset role;
select results_eq($$select count(*)::integer from public.observability_route_samples where route_key = 'complete_match_and_rotate' and duration_ms = 250 and status_code = 200$$, array[1], 'rotation telemetry stores only route timing and status');
select results_eq(
  $$select count(*)::integer from public.privileged_access_audit where actor_id = '61000000-0000-0000-0000-000000000001' and action = 'platform_overview' and outcome = 'allowed'$$,
  array[1],
  'privileged overview access is audited with actor and reason'
);

insert into public.observability_route_samples(route_key, duration_ms, status_code, occurred_at)
select 'public_snapshot', 1500, 200, clock_timestamp() - interval '6 minutes'
from generate_series(1, 50);
insert into public.observability_route_samples(route_key, duration_ms, status_code, occurred_at)
select 'public_snapshot', 1600, 200, clock_timestamp()
from generate_series(1, 50);

select ok(
  exists (select 1 from public.incident_records where incident_kind = 'latency' and route_key = 'public_snapshot'),
  'two five-minute windows above p95 threshold create a deduplicated incident'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select public.platform_health_check()->>'status'$$, array['ok'], 'anonymous synthetic health check exposes only safe status');

select case when count(*) = 0 then 'ok 22/22' else 'failed: ' || string_agg(result, E'\n') end as phase4_test_summary from finish() as result;
rollback;
