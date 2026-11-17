begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

insert into auth.users (id, email) values
  ('78000000-0000-4000-8000-000000000001', 'ranka-operations@example.test'),
  ('78000000-0000-4000-8000-000000000002', 'ranka-outsider@example.test');
insert into public.organizations (id,name,owner_user_id)
values ('78000000-0000-4000-8000-000000000010','Futebol teste','78000000-0000-4000-8000-000000000001');
insert into public.rankas (id,org_id,name,slug)
values ('78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000010','Ranka teste','ranka-operations');
insert into public.sessions (id,org_id,ranka_id,scheduled_on,state,season_year,contribution_amount_cents)
values ('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000020',current_date,'running',extract(year from current_date),500);
insert into public.squads (id,session_id,ranka_id,org_id,squad_number,state,queue_position,formation_method)
select ('78000000-0000-4000-8000-00000000004'||i)::uuid, '78000000-0000-4000-8000-000000000030',
  '78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000010',i,
  case when i < 3 then 'field'::public.squad_state else 'waiting'::public.squad_state end,i,'manual'
from generate_series(1,4) i;
insert into public.players (id,org_id,full_name)
select ('78000000-0000-4000-8000-00000000005'||i)::uuid,'78000000-0000-4000-8000-000000000010','Jogador de teste '||i
from generate_series(1,5) i;
insert into public.squad_members (squad_id,session_id,org_id,player_id,assignment_order,assigned_by)
select '78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000030',
  '78000000-0000-4000-8000-000000000010',('78000000-0000-4000-8000-00000000005'||i)::uuid,i,'78000000-0000-4000-8000-000000000001'
from generate_series(1,4) i;
insert into public.matches (id,session_id,ranka_id,org_id,ordinal,yellow_squad_id,red_squad_id,state)
values ('78000000-0000-4000-8000-000000000060','78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000020',
  '78000000-0000-4000-8000-000000000010',1,'78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000042','live');
insert into public.match_assignments (match_id,session_id,org_id,player_id,role,created_by)
select '78000000-0000-4000-8000-000000000060','78000000-0000-4000-8000-000000000030',
  '78000000-0000-4000-8000-000000000010',('78000000-0000-4000-8000-00000000005'||i)::uuid,'ball_boy','78000000-0000-4000-8000-000000000001'
from generate_series(1,2) i;
insert into public.attendance (session_id,org_id,player_id,arrival_index,role_preference,idempotency_key,created_by)
values ('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000010',
  '78000000-0000-4000-8000-000000000055',1,'keeper',gen_random_uuid(),'78000000-0000-4000-8000-000000000001');


set local role authenticated;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.bulk_add_arrivals('78000000-0000-4000-8000-000000000030','[{"fullName":"Chegou Depois","role":"line"}]',1,gen_random_uuid())$$,'late arrival is saved');
select is((select s.squad_number::text from public.squad_members sm join public.squads s on s.id=sm.squad_id join public.players p on p.id=sm.player_id where p.full_name='Chegou Depois' and sm.removed_at is null),'3','late arrival goes to first waiting team with vacancy');
select lives_ok($$select public.add_direct_team_arrival('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000044','Entrada no Time Quatro',2,gen_random_uuid())$$,'direct arrival selects the indicated team');
select is((select s.squad_number::text from public.squad_members sm join public.squads s on s.id=sm.squad_id join public.players p on p.id=sm.player_id where p.full_name='Entrada no Time Quatro' and sm.removed_at is null),'4','direct entry also creates presence');
select throws_ok($$select public.redraw_waiting_squads('78000000-0000-4000-8000-000000000030',array['78000000-0000-4000-8000-000000000041','78000000-0000-4000-8000-000000000044']::uuid[],12,3,gen_random_uuid())$$,'22023',null,'field teams cannot be shuffled');
select lives_ok($$select public.redraw_waiting_squads('78000000-0000-4000-8000-000000000030',array['78000000-0000-4000-8000-000000000043','78000000-0000-4000-8000-000000000044']::uuid[],12,3,gen_random_uuid())$$,'waiting teams can be shuffled');
select ok((select count(*)=6 from public.squad_members where removed_at is null),'redraw does not duplicate or drop players');
select set_config('test.team_invite',public.create_open_team_invite('78000000-0000-4000-8000-000000000010')::text,true);
select ok(public.team_invite_open(current_setting('test.team_invite')::uuid),'open team invite is available');
reset role;
insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_app_meta_data)
values ('78000000-0000-4000-8000-000000000003','court-new@example.test',now(),'test-hash',
  jsonb_build_object('rankae_team_only',true,'rankae_team_invite',current_setting('test.team_invite')));
select ok(not public.team_invite_open(current_setting('test.team_invite')::uuid),'account creation closes link');
select ok(exists(select 1 from public.organization_members where user_id='78000000-0000-4000-8000-000000000003' and active),'account creation also grants team access');
select throws_ok($$insert into auth.users(id,email,raw_app_meta_data) values ('78000000-0000-4000-8000-000000000004','reuse@example.test',jsonb_build_object('rankae_team_invite',current_setting('test.team_invite')))$$,'PT404',null,'one-use link cannot create a second account');

set local role authenticated;
select set_config('test.court_link',public.configure_court_access('78000000-0000-4000-8000-000000000030','0123')::text,true);
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select ok(not public.unlock_court_access(current_setting('test.court_link')::uuid,'0000',repeat('B',43)),'invalid PIN is rejected');
select ok(public.get_court_day(current_setting('test.court_link')::uuid,repeat('B',43)) is null,'unverified device cannot see play data');
select ok(public.unlock_court_access(current_setting('test.court_link')::uuid,'0123',repeat('A',43)),'PIN activates a device');
select is(public.get_court_day(current_setting('test.court_link')::uuid,repeat('A',43))->>'name','Ranka teste','verified device can read the game');
select lives_ok($$select public.court_day_command(current_setting('test.court_link')::uuid,repeat('A',43),'arrival','{"name":"Entrada pelo PIN","role":"line"}',4,gen_random_uuid())$$,'guest can register arrivals without account');
select throws_ok($$select public.court_day_command(current_setting('test.court_link')::uuid,repeat('A',43),'settings','{}',5,gen_random_uuid())$$,'22023',null,'guest cannot use unrestricted commands');
select lives_ok($$select public.court_day_command(current_setting('test.court_link')::uuid,repeat('A',43),'pause','{}',1,gen_random_uuid())$$,'guest can control the clock');
select is(public.get_court_day(current_setting('test.court_link')::uuid,repeat('A',43))->'match'->>'state','paused','verified guest receives updated clock state');
select ok((select auth.uid() is null),'guest command does not retain the owner identity');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.configure_court_access('78000000-0000-4000-8000-000000000030',null);
select ok(public.get_court_day(current_setting('test.court_link')::uuid,repeat('A',43)) is null,'revocation closes persistent device access');

reset role;
insert into public.sessions(id,org_id,ranka_id,scheduled_on,state,season_year)
values('78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000020',current_date+1,'check_in',extract(year from current_date+1));
set local role authenticated;
select public.bulk_add_arrivals('78000000-0000-4000-8000-000000000031',
  (select jsonb_agg(jsonb_build_object('fullName','Jogador Sorteio '||n,'role','line') order by n) from generate_series(1,8) n),1,gen_random_uuid());
select lives_ok($$select public.generate_squads_extended('78000000-0000-4000-8000-000000000031',2,'pairs',51,2,gen_random_uuid(),null,1)$$,'pair shuffle supports four teams');
select ok(not exists(select 1 from public.squad_members sm join public.squads q on q.id=sm.squad_id join public.attendance a on a.player_id=sm.player_id and a.session_id=sm.session_id where sm.session_id='78000000-0000-4000-8000-000000000031' and sm.removed_at is null and ((q.squad_number<=2) <> (a.arrival_index<=4))),'pair shuffle preserves the arrival blocks');
select lives_ok($$select public.generate_squads_extended('78000000-0000-4000-8000-000000000031',2,'all',51,3,gen_random_uuid(),null,1)$$,'all teams can be shuffled as one pool');
select ok((select array_agg(sm.player_id order by sm.squad_id,sm.assignment_order)
  =array_agg(sm.player_id order by md5('51'||sm.player_id::text)) from public.squad_members sm
  where sm.session_id='78000000-0000-4000-8000-000000000031' and sm.removed_at is null),'full draw uses a single shuffled player pool');
select * from finish();
rollback;
