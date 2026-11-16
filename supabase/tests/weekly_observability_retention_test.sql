begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id, email) values ('caa20000-0000-4000-8000-000000000001', 'retention-owner@example.test');
insert into public.platform_admins(user_id) values ('caa20000-0000-4000-8000-000000000001');
insert into public.organizations(id,name,owner_user_id) values ('caa20000-0000-4000-8000-000000000011', 'Retenção', 'caa20000-0000-4000-8000-000000000001');
insert into public.rankas(id,org_id,slug,name) values ('caa20000-0000-4000-8000-000000000021', 'caa20000-0000-4000-8000-000000000011', 'retention-test', 'Ranka de retenção');
insert into public.observability_route_samples(route_key,duration_ms,status_code,occurred_at) values
  ('public_snapshot', 100, 200, now() - interval '40 days'), ('public_snapshot', 500, 500, now() - interval '40 days'), ('public_snapshot', 200, 200, now());
insert into public.portal_access_attempts (ranka_id,fingerprint_hash,succeeded,attempted_at) values
  ('caa20000-0000-4000-8000-000000000021','retention-old',false, now() - interval '15 days'),
  ('caa20000-0000-4000-8000-000000000021','retention-new',false, now());
insert into private.team_invites(org_id,email,expires_at) values ('caa20000-0000-4000-8000-000000000011','old-invite@example.test',now() - interval '31 days');
insert into public.privileged_access_audit(actor_id,action,reason,outcome,occurred_at) values
  ('caa20000-0000-4000-8000-000000000001','retention_fixture','Registro preservado no teste','completed',now() - interval '40 days');

select lives_ok($$select private.prune_operational_logs()$$, 'retention job runs');
select is((select sum(samples)::text from private.observability_daily where route_key = 'public_snapshot' and day = (now() at time zone 'UTC')::date - 40), '2', 'old samples are archived as daily counts');
select is((select sum(server_errors)::text from private.observability_daily where day = (now() at time zone 'UTC')::date - 40), '1', 'error counts remain in aggregates');
select ok(exists(select 1 from public.observability_route_samples where duration_ms = 200 and occurred_at >= now()) and not exists(select 1 from public.observability_route_samples where duration_ms = 500 and occurred_at < now() - interval '30 days'), 'only old raw samples are removed');
select ok(not exists(select 1 from public.portal_access_attempts where fingerprint_hash = 'retention-old') and exists(select 1 from public.portal_access_attempts where fingerprint_hash = 'retention-new'), 'recent rate limit data remains');
select ok(not exists(select 1 from private.team_invites where email = 'old-invite@example.test') and exists(select 1 from public.privileged_access_audit where action = 'retention_fixture'), 'old invites are removed and privileged audit remains');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"caa20000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.admin_get_retention_status()->>'archivedSamples', '2', 'admin can inspect cleanup results');
select throws_ok($$select private.prune_operational_logs()$$, '42501', null, 'ordinary authenticated roles cannot run cleanup');
select * from finish();
rollback;
