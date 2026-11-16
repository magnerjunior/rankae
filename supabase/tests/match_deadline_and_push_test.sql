begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

insert into auth.users (id, email) values
  ('7c000000-0000-4000-8000-000000000010', 'clock-owner@example.test'),
  ('7c000000-0000-4000-8000-000000000011', 'clock-other@example.test');
insert into public.organizations (id, name, owner_user_id) values
  ('7c000000-0000-4000-8000-000000000020', 'Organizadores de teste', '7c000000-0000-4000-8000-000000000010');
insert into public.rankas (id, org_id, slug, name) values
  ('7c000000-0000-4000-8000-000000000030', '7c000000-0000-4000-8000-000000000020', 'cronometro-teste', 'Ranka de teste');
insert into public.sessions (id, ranka_id, org_id, scheduled_on, state, season_year) values
  ('7c000000-0000-4000-8000-000000000040', '7c000000-0000-4000-8000-000000000030',
   '7c000000-0000-4000-8000-000000000020', current_date, 'running', extract(year from current_date)::integer);
insert into public.squads (id, session_id, ranka_id, org_id, squad_number, queue_position, formation_method) values
  ('7c000000-0000-4000-8000-000000000051', '7c000000-0000-4000-8000-000000000040', '7c000000-0000-4000-8000-000000000030', '7c000000-0000-4000-8000-000000000020', 1, 1, 'manual'),
  ('7c000000-0000-4000-8000-000000000052', '7c000000-0000-4000-8000-000000000040', '7c000000-0000-4000-8000-000000000030', '7c000000-0000-4000-8000-000000000020', 2, 2, 'manual');
insert into public.matches (id, session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state, started_at_server, duration_limit_ms) values
  ('7c000000-0000-4000-8000-000000000060', '7c000000-0000-4000-8000-000000000040', '7c000000-0000-4000-8000-000000000030',
   '7c000000-0000-4000-8000-000000000020', 1, '7c000000-0000-4000-8000-000000000051', '7c000000-0000-4000-8000-000000000052',
   'live', clock_timestamp() - interval '30 seconds', 60000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.expire_match_clock('7c000000-0000-4000-8000-000000000060')$$, '42501', null, 'outsider cannot advance match');
select throws_ok($$select public.set_match_push_device('7c000000-0000-4000-8000-000000000030','https://fcm.googleapis.com/fcm/send/test',repeat('A',87),repeat('B',22))$$, '42501', null, 'outsider cannot subscribe');
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-000000000010","role":"authenticated"}', true);
select is(public.expire_match_clock('7c000000-0000-4000-8000-000000000060')->>'changed','false','clock remains running before the deadline');
select lives_ok($$select public.save_ranka_kits('7c000000-0000-4000-8000-000000000030',1,gen_random_uuid(),'blue','shirtless')$$, 'owner updates pitch kits');
select is((select settings_json->'kits'->>'red' from public.rankas where slug='cronometro-teste'),'shirtless','kit persists without a session rules change');
select throws_ok($$select public.set_match_push_device('7c000000-0000-4000-8000-000000000030','https://fcm.googleapis.com.example.test/no',repeat('A',87),repeat('B',22))$$, '22023', null, 'unrecognized push hosts are refused');
select lives_ok($$select public.set_match_push_device('7c000000-0000-4000-8000-000000000030','https://fcm.googleapis.com/fcm/send/test',repeat('A',87),repeat('B',22))$$, 'owner subscribes a device');
select ok(public.has_match_push_device('7c000000-0000-4000-8000-000000000030','https://fcm.googleapis.com/fcm/send/test'), 'device is marked registered');
select throws_ok($$select public.claim_match_push('invalid')$$, '42501', null, 'authenticated user cannot claim push jobs');

reset role;
update public.matches set started_at_server = clock_timestamp() - interval '62 seconds' where id = '7c000000-0000-4000-8000-000000000060';
select private.process_match_deadlines();
select is((select state::text from public.matches where id = '7c000000-0000-4000-8000-000000000060'),'overtime_live','scheduled pass starts overtime without a browser');
select ok((select abs(extract(epoch from (clock_timestamp() - started_at_server))) between 1 and 5 from public.matches where id = '7c000000-0000-4000-8000-000000000060'),'overtime starts at the regulation deadline');
insert into public.match_events (match_id, session_id, org_id, event_type, side, goal_kind, occurrence_ms, idempotency_key, created_by)
values ('7c000000-0000-4000-8000-000000000060', '7c000000-0000-4000-8000-000000000040', '7c000000-0000-4000-8000-000000000020',
  'goal', 'yellow', 'normal', 1000, gen_random_uuid(), '7c000000-0000-4000-8000-000000000010');
update public.matches set started_at_server = clock_timestamp() - interval '240 seconds' where id = '7c000000-0000-4000-8000-000000000060';
select private.process_match_deadlines();
select is((select state::text from public.matches where id = '7c000000-0000-4000-8000-000000000060'),'completed','overtime ends with a winner');
select is((select revision::text from private.match_push_queue where match_id = '7c000000-0000-4000-8000-000000000060'),'3','latest clock transition is queued for lock screen delivery');
select ok((select count(*)=2 from public.audit_logs where match_id='7c000000-0000-4000-8000-000000000060' and action='clock_deadline' and actor_id is null),'automatic changes are audited as system actions');

select * from finish();
rollback;
