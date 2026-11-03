begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('51000000-0000-0000-0000-000000000001', 'phase3-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, owner_user_id)
values ('5a000000-0000-0000-0000-000000000001', 'Organização Portal', '51000000-0000-0000-0000-000000000001');
insert into public.rankas (id, org_id, slug, name)
values ('5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'portal-fase-3', 'Portal Fase 3');
insert into public.ranka_organizers (ranka_id, member_id, org_id, role)
select '5b000000-0000-0000-0000-000000000001', id, org_id, 'owner' from public.organization_members where org_id = '5a000000-0000-0000-0000-000000000001';

insert into public.players (id, org_id, full_name, nickname, public_visible, public_display_name)
values
  ('52000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Nome Privado Completo', 'Craque', false, null),
  ('52000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', 'Outro Nome Interno', 'Muralha', false, null);

insert into public.sessions (id, ranka_id, org_id, scheduled_on, state, season_year)
values
  ('5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', current_date, 'completed', extract(year from current_date)::integer),
  ('5c000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', (date_trunc('month', current_date) - interval '1 day')::date, 'completed', extract(year from (date_trunc('month', current_date) - interval '1 day'))::integer);

insert into public.attendance (id, session_id, org_id, player_id, arrival_index, idempotency_key, created_by)
values
  (gen_random_uuid(), '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 1, gen_random_uuid(), '51000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 2, gen_random_uuid(), '51000000-0000-0000-0000-000000000001');

insert into public.squads (id, session_id, ranka_id, org_id, squad_number, state, queue_position, formation_method)
values
  ('53000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 1, 'field', 1, 'sequential'),
  ('53000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 2, 'field', 2, 'sequential'),
  ('53000000-0000-0000-0000-000000000003', '5c000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 1, 'field', 1, 'sequential'),
  ('53000000-0000-0000-0000-000000000004', '5c000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 2, 'field', 2, 'sequential');

insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assigned_by)
values
  ('53000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 1, '51000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 1, '51000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000003', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 1, '51000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000004', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 1, '51000000-0000-0000-0000-000000000001');

insert into public.matches (id, session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state, ended_at)
values
  ('54000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 1, '53000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', 'completed', now()),
  ('54000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 1, '53000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000004', 'completed', now());

insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
values
  ('54000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'yellow', 'line', '51000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000002', 'red', 'line', '51000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000003', 'yellow', 'line', '51000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000004', 'red', 'line', '51000000-0000-0000-0000-000000000001');

insert into public.match_events (match_id, session_id, org_id, event_type, side, scorer_player_id, assist_player_id, goal_kind, occurrence_ms, idempotency_key, created_by)
values
  ('54000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'goal', 'yellow', '52000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 'normal', 1000, gen_random_uuid(), '51000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'goal', 'yellow', '52000000-0000-0000-0000-000000000001', null, 'normal', 2000, gen_random_uuid(), '51000000-0000-0000-0000-000000000001'),
  ('54000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001', 'goal', 'yellow', '52000000-0000-0000-0000-000000000001', null, 'normal', 1000, gen_random_uuid(), '51000000-0000-0000-0000-000000000001');

insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
values
  ('5a000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '54000000-0000-0000-0000-000000000001', 'complete_and_rotate', 'match', '54000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', gen_random_uuid(), '{"result":"yellow"}'),
  ('5a000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', '54000000-0000-0000-0000-000000000002', 'complete_and_rotate', 'match', '54000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000001', gen_random_uuid(), '{"result":"yellow"}');

insert into public.contribution_records (session_id, org_id, player_id, amount_cents, status, note, recorded_by)
values ('5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 9999, 'paid', 'SEGREDO-FINANCEIRO', '51000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.configure_public_portal('5b000000-0000-0000-0000-000000000001', 'public', null, null)$$, 'organizer enables public portal');
select results_eq($$select public.get_public_portal_gate('portal-fase-3')->>'status'$$, array['open'], 'public gate is open');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select isnt(public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null), null, 'anonymous visitor receives sanitized snapshot');
select ok(strpos(public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null)::text, 'SEGREDO-FINANCEIRO') = 0, 'financial note never enters snapshot');
select ok(strpos(public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null)::text, 'Nome Privado Completo') = 0, 'hidden full name never enters snapshot');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.set_player_public_profile('52000000-0000-0000-0000-000000000001', true, 'Craque Público')$$, 'organizer opts player into public profile');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(strpos(public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null)::text, 'Craque Público') > 0, 'authorized public display name is visible');
select results_eq($$select (public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null) #>> '{stats,0,goals}')::integer$$, array[2], 'month filter counts only current month goals');
select results_eq($$select jsonb_array_length(public.get_public_ranka_snapshot('portal-fase-3', null, 'day', current_date)->'results')$$, array[1], 'specific day returns only that session');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.configure_public_portal('5b000000-0000-0000-0000-000000000001', 'unlisted', null, repeat('L', 40))$$, 'organizer enables unlisted portal');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_public_ranka_snapshot('portal-fase-3', null, 'month', null), null, 'unlisted portal rejects visitor without grant');
select is((public.exchange_public_portal_access('portal-fase-3', repeat('X', 40), null, repeat('G', 40), 'fingerprint-wrong')->>'authorized')::boolean, false, 'wrong link is rejected');
select is((public.exchange_public_portal_access('portal-fase-3', repeat('L', 40), null, repeat('G', 40), 'fingerprint-good')->>'authorized')::boolean, true, 'correct long link creates temporary grant');
select isnt(public.get_public_ranka_snapshot('portal-fase-3', repeat('G', 40), 'month', null), null, 'temporary unlisted grant reads snapshot');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.configure_public_portal('5b000000-0000-0000-0000-000000000001', 'pin_protected', '1234', repeat('P', 40))$$, 'organizer enables link plus PIN');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '0000', repeat('W', 40), 'pin-abuse')->>'authorized')::boolean, false, 'wrong PIN is rejected generically');
select public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '0000', repeat('1', 40), 'pin-abuse');
select public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '0000', repeat('2', 40), 'pin-abuse');
select public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '0000', repeat('3', 40), 'pin-abuse');
select public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '0000', repeat('4', 40), 'pin-abuse');
select results_eq($$select public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '1234', repeat('Z', 40), 'pin-abuse')->>'status'$$, array['locked'], 'rate limit blocks repeated PIN attempts');
select is((public.exchange_public_portal_access('portal-fase-3', repeat('P', 40), '1234', repeat('Q', 40), 'pin-good')->>'authorized')::boolean, true, 'correct PIN with complete link grants a different viewer');
select isnt(public.get_public_ranka_snapshot('portal-fase-3', repeat('Q', 40), 'last', null), null, 'PIN grant reads sanitized snapshot');

select case when count(*) = 0 then 'ok 19/19' else 'failed: ' || string_agg(result, E'\n') end as phase3_test_summary from finish() as result;
rollback;
