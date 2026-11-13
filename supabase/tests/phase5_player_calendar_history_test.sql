begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('61000000-0000-0000-0000-000000000001', 'phase5-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.organizations (id, name, owner_user_id)
values ('6a000000-0000-0000-0000-000000000001', 'Organização Fase 5', '61000000-0000-0000-0000-000000000001');
insert into public.rankas (id, org_id, slug, name, visibility)
values ('6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'fase-5', 'Ranka Fase 5', 'public');
insert into public.ranka_organizers (ranka_id, member_id, org_id, role)
select '6b000000-0000-0000-0000-000000000001', id, org_id, 'owner'
from public.organization_members where org_id = '6a000000-0000-0000-0000-000000000001';
insert into public.players (id, org_id, full_name, role_preference)
values ('62000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'Goleiro Teste', 'keeper');
insert into public.sessions (id, ranka_id, org_id, scheduled_on, state, season_year, contribution_amount_cents, rules_snapshot)
values ('6c000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', (clock_timestamp() at time zone 'America/Sao_Paulo')::date, 'completed', extract(year from (clock_timestamp() at time zone 'America/Sao_Paulo'))::integer, 500, '{}');
insert into public.attendance (id, session_id, org_id, player_id, arrival_index, role_preference, status, idempotency_key, created_by)
values ('63000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 1, 'keeper', 'present', '64000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.set_session_keeper_waiver('6c000000-0000-0000-0000-000000000001', true, 1, '64000000-0000-0000-0000-000000000002')$$, 'enables keeper exemption for this session');
select results_eq($$select status::text from public.contribution_records where session_id = '6c000000-0000-0000-0000-000000000001' and player_id = '62000000-0000-0000-0000-000000000001'$$, array['waived'::text], 'existing keeper contribution is recorded as waived');
select lives_ok($$select public.set_session_keeper_waiver('6c000000-0000-0000-0000-000000000001', false, 2, '64000000-0000-0000-0000-000000000003')$$, 'disables keeper exemption with the next revision');
select results_eq($$select status::text from public.contribution_records where session_id = '6c000000-0000-0000-0000-000000000001' and player_id = '62000000-0000-0000-0000-000000000001'$$, array['pending'::text], 'removing the rule reopens only its generated waiver');

insert into public.squads (id, session_id, ranka_id, org_id, squad_number, queue_position, formation_method)
values
  ('65000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 1, 1, 'sequential'),
  ('65000000-0000-0000-0000-000000000002', '6c000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 2, 2, 'sequential');
insert into public.matches (id, session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state)
values ('66000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 1, '65000000-0000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000002', 'completed');
insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
values ('66000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000002', 'red', 'keeper', '61000000-0000-0000-0000-000000000001');
insert into public.match_events (id, match_id, session_id, org_id, event_type, side, goal_kind, occurrence_ms, idempotency_key, created_by)
values ('67000000-0000-0000-0000-000000000001', '66000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-000000000001', 'goal', 'yellow', 'normal', 60000, '64000000-0000-0000-0000-000000000004', '61000000-0000-0000-0000-000000000001');
select lives_ok($$select public.edit_match_goal('67000000-0000-0000-0000-000000000001', 'red', 'normal', 120000, '62000000-0000-0000-0000-000000000001', null, 1, '64000000-0000-0000-0000-000000000005')$$, 'edits a historic goal transactionally');
select results_eq($$select side::text || ':' || occurrence_ms::text || ':' || scorer_player_id::text from public.match_events where id = '67000000-0000-0000-0000-000000000001'$$, array['red:120000:62000000-0000-0000-0000-000000000001'], 'goal side, minute and scorer are corrected together');
select lives_ok($$select public.create_player_profile('6a000000-0000-0000-0000-000000000001', 'Jogador Contato', null, '+5531999998888', false, '64000000-0000-0000-0000-000000000006')$$, 'organizer creates a profile with a private contact');
select throws_ok($$select phone from public.player_contacts$$, '42501', null, 'contact table is not directly exposed to authenticated clients');
select lives_ok($$select public.update_ranka_schedule('6b000000-0000-0000-0000-000000000001', 1, '64000000-0000-0000-0000-000000000007', 'weekly', null, array[1,5], null)$$, 'organizer can save multiple weekdays');
select is((select settings_json->'schedule'->'weekdays' from public.rankas where slug = 'fase-5'), '[1,5]'::jsonb, 'schedule persists on the ranka');
select lives_ok($$select public.pay_ranka_pending_contribution('6b000000-0000-0000-0000-000000000001','6c000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',3,'64000000-0000-0000-0000-000000000008')$$, 'organizer can settle a closed-session contribution');
select is((select count(*) from public.get_ranka_pending_contributions('6b000000-0000-0000-0000-000000000001')), 0::bigint, 'settled contribution leaves the pending list');
select is(public.get_internal_ranka_statistics('fase-5','last',null)->'stats'->0->>'name', 'Goleiro Teste', 'internal ranking uses the organizer view');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_ranka_snapshot('fase-5')->'results'->0->>'matchId', '66000000-0000-0000-0000-000000000001', 'results link to the exact match');
select is(public.get_ranka_match_details('fase-5','66000000-0000-0000-0000-000000000001',null,true), null::jsonb, 'anonymous callers cannot request internal names');
select is(jsonb_array_length(public.get_public_ranka_calendar('fase-5', null, (clock_timestamp() at time zone 'America/Sao_Paulo')::date)), 1, 'public calendar returns only a date count');

select case when count(*) = 0 then 'ok 16/16' else 'failed: ' || string_agg(result, E'\n') end as phase5_test_summary from finish() as result;
rollback;
