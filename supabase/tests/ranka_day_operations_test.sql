begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

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
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_ranka_day_overview('78000000-0000-4000-8000-000000000020')$$,'42501',null,'ranka statistics remain private');
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_ranka_keeper_waiver('78000000-0000-4000-8000-000000000020',true,1,gen_random_uuid())$$,'owner sets recurring waiver');
select is((select status::text from public.contribution_records),'waived','present keeper is waived');
reset role;
update public.sessions set rules_snapshot = '{"squadSize":4}' where id='78000000-0000-4000-8000-000000000030';
select is((select rules_snapshot->>'waiveKeeperContributions' from public.sessions),'true','editing game rules keeps waiver');
insert into public.sessions (id,org_id,ranka_id,scheduled_on,state,season_year)
values ('78000000-0000-4000-8000-000000000031','78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000020',current_date+1,'check_in',extract(year from current_date+1));
select is((select rules_snapshot->>'waiveKeeperContributions' from public.sessions where id='78000000-0000-4000-8000-000000000031'),'true','future session inherits waiver');

update public.matches set state='completed' where ordinal=1;
select is((select string_agg(right(player_id::text,1),' ' order by assignment_order) from public.squad_members where removed_at is null),'3 4 1 2','helpers move to the back without changing sides');
update public.matches set state='completed', revision=revision+1 where ordinal=1;
select is((select string_agg(right(player_id::text,1),' ' order by assignment_order) from public.squad_members where removed_at is null),'3 4 1 2','repeated finish does not rotate again');
select private.requeue_squad_as_new('78000000-0000-4000-8000-000000000043',5,5);
select is((select string_agg(right(player_id::text,1),' ' order by assignment_order) from public.squad_members where removed_at is null),'3 4 1 2','renumbered team keeps the helper order');
update public.sessions set state='completed' where id='78000000-0000-4000-8000-000000000030';
set local role authenticated;
select is(public.get_ranka_day_overview('78000000-0000-4000-8000-000000000020')->>'matches','1','overview counts completed matches');
select is(public.get_ranka_day_overview('78000000-0000-4000-8000-000000000020')->'lastDay'->>'matches','1','overview uses the last finished day');
select ok((public.get_ranka_day_overview('78000000-0000-4000-8000-000000000020')->'star') = 'null'::jsonb,'zero credited plays has no weekly star');
select * from finish();
rollback;
