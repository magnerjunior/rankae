begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

insert into auth.users (id, email)
values ('ad100000-0000-4000-8000-000000000001', 'admin-test@example.test'),
       ('ad100000-0000-4000-8000-000000000002', 'organizer-test@example.test');
insert into public.platform_admins (user_id) values ('ad100000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ad100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_get_accounts_and_receipts()$$, '42501', 'Forbidden', 'admin without MFA cannot see accounts');
select set_config('request.jwt.claims', '{"sub":"ad100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_grant_ranka_trial('ad100000-0000-4000-8000-000000000002', 3, 7, 'Teste controlado')$$, 'admin can grant quota');
select lives_ok($$select public.admin_record_receipt('ad100000-0000-4000-8000-000000000002', 2990, current_date - 1, 'Teste pagamento', 'ad100000-0000-4000-8000-000000000003')$$, 'admin records payment');
select lives_ok($$select public.admin_record_receipt('ad100000-0000-4000-8000-000000000002', 2990, current_date - 1, 'Teste pagamento', 'ad100000-0000-4000-8000-000000000003')$$, 'retry is safe');
reset role;
select is((select count(*) from public.platform_receipts where id = 'ad100000-0000-4000-8000-000000000003'), 1::bigint, 'payment was only recorded once');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ad100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
select is(public.get_ranka_entitlement()->>'limit', '3', 'organizer gets temporary quota');
select throws_ok($$select public.admin_get_accounts_and_receipts()$$, '42501', 'Forbidden', 'ordinary organizer with MFA cannot see finance');
select * from finish();
rollback;
