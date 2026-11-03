begin;
select plan(12);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@example.test', crypt('test-password-a', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'owner-b@example.test', crypt('test-password-b', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'outsider@example.test', crypt('test-password-c', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.organizations (id, name, owner_user_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Organização A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Organização B', '20000000-0000-0000-0000-000000000002');

insert into public.rankas (id, org_id, slug, name) values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ranka-a', 'Ranka A'),
  ('bb000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'ranka-b', 'Ranka B');

insert into public.players (id, org_id, full_name) values
  ('aaa00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Jogador da Organização A'),
  ('bbb00000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Jogador da Organização B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq('select count(*)::bigint from public.organizations', array[1::bigint], 'owner A sees one organization');
select results_eq('select id from public.organizations', array['a0000000-0000-0000-0000-000000000001'::uuid], 'owner A sees only organization A');
select results_eq('select count(*)::bigint from public.players', array[1::bigint], 'owner A sees only own players');
select is_empty('select 1 from public.players where org_id = ''b0000000-0000-0000-0000-000000000002''', 'owner A cannot read B players');
select lives_ok($$insert into public.players (org_id, full_name) values ('a0000000-0000-0000-0000-000000000001', 'Novo Jogador A')$$, 'owner A can create own player');
select throws_ok($$insert into public.players (org_id, full_name) values ('b0000000-0000-0000-0000-000000000002', 'Invasor')$$, '42501', null, 'owner A cannot create B player');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty('select id from public.organizations', 'outsider sees no organizations');
select is_empty('select id from public.rankas', 'outsider sees no rankas');
select is_empty('select id from public.players', 'outsider sees no players');
select is_empty('select id from public.sessions', 'outsider sees no sessions');
select throws_ok($$insert into public.rankas (org_id, slug, name) values ('a0000000-0000-0000-0000-000000000001', 'forbidden', 'Forbidden')$$, '42501', null, 'outsider cannot create ranka');

set local role anon;
select is_empty('select id from public.organizations', 'anonymous role cannot read private organizations');

select * from finish();
rollback;
