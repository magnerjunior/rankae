begin;
select plan(8);

select has_table('public', 'commercial_plan_settings', 'commercial plan table exists');
select has_table('public', 'owner_entitlements', 'owner entitlement table exists');
select has_function('public', 'get_commercial_plan', array[]::text[], 'public plan projection exists');
select has_function('public', 'get_ranka_entitlement', array[]::text[], 'authenticated entitlement projection exists');

select is((public.get_commercial_plan()->>'monthlyPriceCents')::integer, 2990, 'monthly launch price is configured');
select is((public.get_commercial_plan()->>'extraRankaPriceCents')::integer, 1500, 'extra ranka price is configured');
select is((public.get_commercial_plan()->>'trialDays')::integer, 30, 'trial duration is configured');
select is((public.platform_health_check()->>'schemaVersion'), '20261103001700', 'health check exposes commercial schema version');

select * from finish();
rollback;
