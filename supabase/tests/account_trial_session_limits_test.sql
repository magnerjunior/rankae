begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into auth.users (id, email) values
  ('da110000-0000-4000-8000-000000000001', 'trial-admin@example.test'),
  ('da110000-0000-4000-8000-000000000002', 'trial-owner@example.test'),
  ('da110000-0000-4000-8000-000000000003', 'trial-expired@example.test');
insert into public.platform_admins (user_id) values ('da110000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"da110000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.admin_configure_account('da110000-0000-4000-8000-000000000002', 'Organizador Teste', 'trial', 1, false, 1, 30)$$, 'admin configures an independent football-day quota');
select lives_ok($$select public.admin_configure_account('da110000-0000-4000-8000-000000000003', 'Teste Expirado', 'trial', 1, false, 1, 30)$$, 'admin configures a second account independently');
select is(public.admin_get_account_detail('da110000-0000-4000-8000-000000000002')->>'name', 'Organizador Teste', 'admin sees the configured name');

select set_config('request.jwt.claims', '{"sub":"da110000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('rankae.test_workspace', public.create_ranka_workspace('Grupo de teste', 'Futebol do grupo', 'trial-day-test')::text, true);
select ok(current_setting('rankae.test_workspace')::jsonb->>'session_id' is null, 'creating a ranka does not consume the trial day');
select is(public.get_account_trial()->>'remaining', '1', 'the trial day is available after onboarding');
select throws_ok($$select public.create_ranka_workspace('Outro grupo', 'Outro futebol', 'trial-other-ranka')$$, '23514', 'Ranka limit reached', 'the ranka quota is enforced separately');
select throws_ok($$select public.start_ranka_session((current_setting('rankae.test_workspace')::jsonb->>'ranka_id')::uuid, (now() at time zone 'America/Sao_Paulo')::date + 1)$$, 'PT402', 'Trial does not allow a new football day', 'future dates do not start a trial session');
select set_config('rankae.test_session', public.start_ranka_session((current_setting('rankae.test_workspace')::jsonb->>'ranka_id')::uuid, (now() at time zone 'America/Sao_Paulo')::date)->>'id', true);
select is(public.get_account_trial()->>'remaining', '0', 'starting the football day consumes the credit');
select is(public.get_account_trial()->>'ended', 'false', 'the current football day can continue');
select is(public.start_ranka_session((current_setting('rankae.test_workspace')::jsonb->>'ranka_id')::uuid, (now() at time zone 'America/Sao_Paulo')::date)->>'id', current_setting('rankae.test_session'), 'duplicate start resumes the same day');
select throws_ok($$select public.admin_get_account_detail('da110000-0000-4000-8000-000000000003')$$, '42501', 'Forbidden', 'trial organizers cannot inspect another account');

reset role;
insert into public.squads (id, session_id, ranka_id, org_id, squad_number, queue_position, formation_method)
select ('da110000-0000-4000-8000-00000000000' || team)::uuid, s.id, s.ranka_id, s.org_id, team, team, 'manual'
from public.sessions s cross join generate_series(4,5) team where s.id = current_setting('rankae.test_session')::uuid;
select lives_ok($$
  insert into public.matches (session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state)
  select s.id, s.ranka_id, s.org_id, game, 'da110000-0000-4000-8000-000000000004', 'da110000-0000-4000-8000-000000000005', 'completed'
  from public.sessions s cross join generate_series(1,2) game where s.id = current_setting('rankae.test_session')::uuid
$$, 'the trial football day may contain multiple matches');
update public.sessions set state = 'completed' where id = current_setting('rankae.test_session')::uuid;
select throws_ok($$insert into public.matches (session_id) values (current_setting('rankae.test_session')::uuid)$$,
  'PT402', 'Trial does not allow play outside the authorized football day', 'a completed trial session cannot receive another match');
update public.owner_entitlements set trial_started_at = now() - interval '31 days', trial_expires_at = now() - interval '1 day'
where owner_user_id = 'da110000-0000-4000-8000-000000000003';

set local role authenticated;
select is(public.get_account_trial()->>'ended', 'true', 'the used trial ends when the day is closed');
select throws_ok($$select public.start_ranka_session((current_setting('rankae.test_workspace')::jsonb->>'ranka_id')::uuid, (now() at time zone 'America/Sao_Paulo')::date)$$, 'PT402', 'Trial does not allow a new football day', 'closing the day cannot create another session even on the same date');
select is((select state::text from public.sessions where id = current_setting('rankae.test_session')::uuid), 'completed', 'the historical day is still readable');
reset role;
update public.owner_entitlements set trial_session_limit = 2 where owner_user_id = 'da110000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.get_account_trial()->>'canStart', 'false', 'additional trial credits cannot start a second football day on the same date');
select set_config('request.jwt.claims', '{"sub":"da110000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.get_account_trial()->>'ended', 'true', 'the deadline ends a trial with an unused day');
select throws_ok($$select public.create_ranka_workspace('Grupo vencido', 'Futebol vencido', 'expired-trial-ranka')$$, '23514', 'Ranka limit reached', 'an expired trial cannot create a ranka');

select set_config('request.jwt.claims', '{"sub":"da110000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.admin_configure_account('da110000-0000-4000-8000-000000000002', 'Organizador Teste', 'active', 1, false, null, null);
select set_config('request.jwt.claims', '{"sub":"da110000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.start_ranka_session((current_setting('rankae.test_workspace')::jsonb->>'ranka_id')::uuid, (now() at time zone 'America/Sao_Paulo')::date)$$, 'an active non-paying account can play again');
select * from finish();
rollback;
