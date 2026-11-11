begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('41000000-0000-0000-0000-000000000001', 'phase2-owner@example.test', crypt('test-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, owner_user_id)
values ('4a000000-0000-0000-0000-000000000001', 'Organização Fase 2', '41000000-0000-0000-0000-000000000001');
insert into public.rankas (id, org_id, slug, name)
values ('4b000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', 'fase-2', 'Ranka Fase 2');
insert into public.sessions (id, ranka_id, org_id, scheduled_on, state, contribution_amount_cents, rules_snapshot, season_year)
values ('4c000000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', current_date, 'check_in', 500,
  '{"squadSize":6,"regulationDurationMs":600000,"overtimeDurationMs":180000,"tiePolicy":"overtime"}', extract(year from current_date)::integer);

insert into public.players (id, org_id, full_name)
select ('42000000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid,
  '4a000000-0000-0000-0000-000000000001', 'Jogador ' || value
from generate_series(1, 14) value;
insert into public.attendance (id, session_id, org_id, player_id, arrival_index, role_preference, idempotency_key, created_by)
select gen_random_uuid(), '4c000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001',
  ('42000000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid, value, 'line', gen_random_uuid(), '41000000-0000-0000-0000-000000000001'
from generate_series(1, 14) value;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$select public.generate_session_squads('4c000000-0000-0000-0000-000000000001', 6, 'sequential', null, 1, '40000000-0000-0000-0000-000000000001')$$, 'generates persisted squads');
select results_eq($$select count(*)::bigint from public.squads where session_id = '4c000000-0000-0000-0000-000000000001'$$, array[3::bigint], '14 players create three squads');
select results_eq($$select count(*)::bigint from public.squad_members where session_id = '4c000000-0000-0000-0000-000000000001' and removed_at is null$$, array[14::bigint], 'each player is assigned once');
select results_eq($$select count(*)::bigint from (select player_id from public.squad_members where session_id = '4c000000-0000-0000-0000-000000000001' and removed_at is null group by player_id having count(*) > 1) duplicated$$, array[0::bigint], 'no player is duplicated between squads');

select lives_ok($$select public.prepare_next_match('4c000000-0000-0000-0000-000000000001', 2, '40000000-0000-0000-0000-000000000002')$$, 'prepares first match transactionally');
select results_eq($$select state::text from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'$$, array['ready'::text], 'match starts ready');
select results_eq($$select count(*)::bigint from public.match_assignments where session_id = '4c000000-0000-0000-0000-000000000001' and role = 'line'$$, array[12::bigint], 'lineups contain both complete squads');

select lives_ok($$select public.transition_match_clock((select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'), 'start', 1, '40000000-0000-0000-0000-000000000003')$$, 'starts authoritative clock');
select results_eq($$select state::text from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'$$, array['live'::text], 'match becomes live');

select lives_ok($$select public.record_match_event((select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'), 'goal', 'yellow', null, null, null, 'normal', null, null, '{}', 2, '40000000-0000-0000-0000-000000000004')$$, 'records goal without author');
select lives_ok($$select public.record_match_event((select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'), 'goal', 'yellow', null, null, null, 'normal', null, null, '{}', 2, '40000000-0000-0000-0000-000000000004')$$, 'replays same idempotency key safely');
select results_eq($$select count(*)::bigint from public.match_events where session_id = '4c000000-0000-0000-0000-000000000001' and event_type = 'goal'$$, array[1::bigint], 'double tap creates one goal');
select throws_ok($$select public.record_match_event((select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'), 'goal', 'red', null, null, null, 'normal', null, null, '{}', 2, '40000000-0000-0000-0000-000000000005')$$, 'PT409', null, 'stale second editor gets revision conflict');

select lives_ok($$select public.transition_match_clock((select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'), 'pause', 3, '40000000-0000-0000-0000-000000000006')$$, 'second editor can pause current revision');
select results_eq($$select state::text from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'$$, array['paused'::text], 'pause is persisted');
select lives_ok($$select public.void_match_event((select id from public.match_events where session_id = '4c000000-0000-0000-0000-000000000001' and event_type = 'goal'), 'Correção de teste', 4, '40000000-0000-0000-0000-000000000007')$$, 'voids goal with audit trail');
select results_eq($$select count(*)::bigint from public.match_events where session_id = '4c000000-0000-0000-0000-000000000001' and event_type = 'goal' and status = 'active'$$, array[0::bigint], 'voided goal leaves active projection');
select lives_ok($$select public.batch_mark_contributions('4c000000-0000-0000-0000-000000000001', array[
  '42000000-0000-0000-0000-000000000001'::uuid, '42000000-0000-0000-0000-000000000002'::uuid,
  '42000000-0000-0000-0000-000000000003'::uuid, '42000000-0000-0000-0000-000000000004'::uuid,
  '42000000-0000-0000-0000-000000000005'::uuid
], 'paid', null, 3, '40000000-0000-0000-0000-000000000008')$$, 'marks five contributions in one transaction');
select results_eq($$select count(*)::bigint from public.contribution_records where session_id = '4c000000-0000-0000-0000-000000000001' and status = 'paid' and amount_cents = 500$$, array[5::bigint], 'batch preserves the amount snapshot per player');

select lives_ok($$select public.manage_match_player(
  '4c000000-0000-0000-0000-000000000001',
  (select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  (select yellow_squad_id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  '42000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000013',
  true, 4, 5, '40000000-0000-0000-0000-000000000009'
)$$, 'organizer replaces a field player and marks permanent departure atomically');
select results_eq($$select status::text from public.attendance where session_id = '4c000000-0000-0000-0000-000000000001' and player_id = '42000000-0000-0000-0000-000000000001'$$, array['left'::text], 'departure removes player from the rest of the day');
select results_eq($$select count(*)::bigint from public.squad_members where squad_id = (select yellow_squad_id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001') and player_id = '42000000-0000-0000-0000-000000000013' and removed_at is null$$, array[1::bigint], 'waiting replacement enters the field squad exactly once');
select lives_ok($$select public.manage_match_player(
  '4c000000-0000-0000-0000-000000000001',
  (select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  (select yellow_squad_id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  '42000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000013',
  true, 4, 5, '40000000-0000-0000-0000-000000000009'
)$$, 'same replacement idempotency key is safe to replay');
select throws_ok($$select public.manage_match_player(
  '4c000000-0000-0000-0000-000000000001',
  (select id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  (select red_squad_id from public.matches where session_id = '4c000000-0000-0000-0000-000000000001'),
  '42000000-0000-0000-0000-000000000007',
  '42000000-0000-0000-0000-000000000014',
  false, 4, 5, '40000000-0000-0000-0000-000000000010'
)$$, 'PT409', null, 'stale organizer cannot overwrite a newer field substitution');

select case
  when count(*) = 0 then 'ok 24/24'
  else 'failed: ' || string_agg(result, E'\n')
end as phase2_test_summary
from finish() as result;
rollback;
