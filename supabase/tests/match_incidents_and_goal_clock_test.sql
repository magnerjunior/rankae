begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

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


update public.sessions set rules_snapshot = '{"targetGoals":2,"targetGoalsConfigured":true}' where id='78000000-0000-4000-8000-000000000030';
update public.matches set started_at_server=clock_timestamp()-interval '30 seconds' where ordinal=1;
insert into public.attendance (session_id,org_id,player_id,arrival_index,role_preference,idempotency_key,created_by)
values ('78000000-0000-4000-8000-000000000030','78000000-0000-4000-8000-000000000010',
  '78000000-0000-4000-8000-000000000054',2,'line',gen_random_uuid(),'78000000-0000-4000-8000-000000000001');
insert into public.match_assignments (match_id,session_id,org_id,player_id,squad_id,field_side,role,created_by)
values ('78000000-0000-4000-8000-000000000060','78000000-0000-4000-8000-000000000030',
  '78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000054','78000000-0000-4000-8000-000000000041','yellow','line','78000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($$select public.record_match_event('78000000-0000-4000-8000-000000000060','goal','yellow',null,null,null,'normal',null,null,'{}',1,gen_random_uuid())$$,'first goal can be recorded');
select is((select state::text from public.matches),'live','clock continues below the limit');
select lives_ok($$select public.record_match_event('78000000-0000-4000-8000-000000000060','goal','yellow',null,null,null,'normal',null,null,
  (select jsonb_build_object('clockStartedAt',started_at_server,'capturedElapsedMs',28500) from public.matches),2,
  '78000000-0000-4000-8000-000000000071')$$,'queued goal is accepted for the same clock segment');
select is((select state::text from public.matches),'paused','deciding goal pauses authoritative clock');
select is((select elapsed_ms_before_start::text from public.matches),'28500','paused time matches local capture');
select is((select occurrence_ms::text from public.match_events where idempotency_key='78000000-0000-4000-8000-000000000071'),'28500','event uses the same timestamp');
select lives_ok($$select public.record_player_match_card('78000000-0000-4000-8000-000000000060','78000000-0000-4000-8000-000000000054','red',3,'78000000-0000-4000-8000-000000000072')$$,'registrar can eject a player on the pitch');
select is((select end_ms::text from public.match_assignments where player_id='78000000-0000-4000-8000-000000000054'),'28500','red card ends the field assignment');
select ok(exists(select 1 from public.attendance where status='present' and player_id='78000000-0000-4000-8000-000000000054'),'red card preserves attendance for the next game');
select * from finish();
rollback;
