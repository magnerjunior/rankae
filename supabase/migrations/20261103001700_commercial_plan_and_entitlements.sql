begin;

create table public.commercial_plan_settings (
  plan_key text primary key check (plan_key = 'default'),
  monthly_price_cents integer not null check (monthly_price_cents between 100 and 10000000),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= monthly_price_cents),
  extra_ranka_price_cents integer not null check (extra_ranka_price_cents between 100 and 10000000),
  annual_price_cents integer check (annual_price_cents is null or annual_price_cents between 100 and 100000000),
  trial_days integer not null check (trial_days between 0 and 90),
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.commercial_plan_settings (
  plan_key, monthly_price_cents, compare_at_price_cents, extra_ranka_price_cents, annual_price_cents, trial_days
) values ('default', 2990, 4990, 1500, 29900, 30);

create table public.owner_entitlements (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  ranka_limit integer not null default 1 check (ranka_limit between 1 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.owner_entitlements (owner_user_id, ranka_limit)
select distinct owner_user_id, 3 from public.organizations
on conflict (owner_user_id) do update set ranka_limit = greatest(public.owner_entitlements.ranka_limit, excluded.ranka_limit), updated_at = now();

create function private.ensure_owner_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.owner_entitlements(owner_user_id, ranka_limit)
  values (new.owner_user_id, 1)
  on conflict (owner_user_id) do nothing;
  return new;
end;
$$;

create trigger organizations_ensure_owner_entitlement
after insert on public.organizations
for each row execute function private.ensure_owner_entitlement();

create function public.get_commercial_plan()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'monthlyPriceCents', monthly_price_cents,
    'compareAtPriceCents', compare_at_price_cents,
    'extraRankaPriceCents', extra_ranka_price_cents,
    'annualPriceCents', annual_price_cents,
    'trialDays', trial_days,
    'active', active
  )
  from public.commercial_plan_settings
  where plan_key = 'default';
$$;

revoke all on function public.get_commercial_plan() from public;
grant execute on function public.get_commercial_plan() to anon, authenticated;

create function public.get_ranka_entitlement()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  allowed integer;
  used integer;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce((select ranka_limit from public.owner_entitlements where owner_user_id = actor_id), 1) into allowed;
  select count(*)::integer into used
  from public.rankas r join public.organizations o on o.id = r.org_id
  where o.owner_user_id = actor_id;
  return jsonb_build_object('limit', allowed, 'used', used, 'canCreate', used < allowed);
end;
$$;

revoke all on function public.get_ranka_entitlement() from public, anon;
grant execute on function public.get_ranka_entitlement() to authenticated;

create function public.admin_update_commercial_plan(
  p_monthly_price_cents integer,
  p_compare_at_price_cents integer,
  p_extra_ranka_price_cents integer,
  p_annual_price_cents integer,
  p_trial_days integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'AAL2 platform administrator required' using errcode = '42501'; end if;
  if char_length(trim(p_reason)) < 8 then raise exception 'Change reason required' using errcode = '22023'; end if;
  if p_monthly_price_cents not between 100 and 10000000
    or p_extra_ranka_price_cents not between 100 and 10000000
    or p_trial_days not between 0 and 90
    or (p_compare_at_price_cents is not null and p_compare_at_price_cents < p_monthly_price_cents)
    or (p_annual_price_cents is not null and p_annual_price_cents not between 100 and 100000000)
  then raise exception 'Invalid commercial plan values' using errcode = '22023'; end if;

  update public.commercial_plan_settings set
    monthly_price_cents = p_monthly_price_cents,
    compare_at_price_cents = p_compare_at_price_cents,
    extra_ranka_price_cents = p_extra_ranka_price_cents,
    annual_price_cents = p_annual_price_cents,
    trial_days = p_trial_days,
    updated_by = actor_id,
    updated_at = now()
  where plan_key = 'default';

  select public.get_commercial_plan() into result;

  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, outcome, metadata)
  values (actor_id, 'update_commercial_plan', trim(p_reason), 'commercial_plan', 'completed', result);
  return result;
end;
$$;

revoke all on function public.admin_update_commercial_plan(integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.admin_update_commercial_plan(integer, integer, integer, integer, integer, text) to authenticated;

create or replace function public.create_additional_ranka(
  p_org_id uuid,
  p_ranka_name text,
  p_ranka_slug text,
  p_scheduled_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  owner_member public.organization_members%rowtype;
  created_ranka public.rankas%rowtype;
  created_session public.sessions%rowtype;
  allowed integer;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(actor_id::text));
  if not exists (select 1 from public.organizations where id = p_org_id and owner_user_id = actor_id) then
    raise exception 'Only the organization owner can create a ranka' using errcode = '42501';
  end if;
  select coalesce((select ranka_limit from public.owner_entitlements where owner_user_id = actor_id), 1) into allowed;
  if (select count(*) from public.rankas r join public.organizations o on o.id = r.org_id where o.owner_user_id = actor_id) >= allowed then
    raise exception 'Ranka limit reached' using errcode = '23514';
  end if;
  if char_length(trim(p_ranka_name)) < 2 or p_ranka_slug <> lower(p_ranka_slug) or p_ranka_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid ranka data' using errcode = '22023';
  end if;
  select * into owner_member from public.organization_members
  where org_id = p_org_id and user_id = actor_id and active and role = 'owner';
  insert into public.rankas (org_id, slug, name) values (p_org_id, p_ranka_slug, trim(p_ranka_name)) returning * into created_ranka;
  insert into public.ranka_organizers (ranka_id, member_id, org_id, role) values (created_ranka.id, owner_member.id, p_org_id, 'owner');
  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
  values (created_ranka.id, p_org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    jsonb_build_object('squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0))
  returning * into created_session;
  return jsonb_build_object('ranka_id', created_ranka.id, 'session_id', created_session.id);
end;
$$;

create or replace function public.create_ranka_workspace(
  p_organization_name text,
  p_ranka_name text,
  p_ranka_slug text,
  p_scheduled_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_org public.organizations%rowtype;
  owner_member public.organization_members%rowtype;
  created_ranka public.rankas%rowtype;
  created_session public.sessions%rowtype;
  allowed integer;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(actor_id::text));
  select coalesce((select ranka_limit from public.owner_entitlements where owner_user_id = actor_id), 1) into allowed;
  if (select count(*) from public.rankas r join public.organizations o on o.id = r.org_id where o.owner_user_id = actor_id) >= allowed then
    raise exception 'Ranka limit reached' using errcode = '23514';
  end if;
  if char_length(trim(p_organization_name)) < 2 or char_length(trim(p_ranka_name)) < 2 then raise exception 'Organization and ranka names are required' using errcode = '22023'; end if;
  if p_ranka_slug <> lower(p_ranka_slug) or p_ranka_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid ranka slug' using errcode = '22023'; end if;

  insert into public.organizations (name, owner_user_id) values (trim(p_organization_name), actor_id) returning * into created_org;
  select * into owner_member from public.organization_members where org_id = created_org.id and user_id = actor_id;
  insert into public.rankas (org_id, slug, name) values (created_org.id, p_ranka_slug, trim(p_ranka_name)) returning * into created_ranka;
  insert into public.ranka_organizers (ranka_id, member_id, org_id, role) values (created_ranka.id, owner_member.id, created_org.id, 'owner');
  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
  values (created_ranka.id, created_org.id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
    jsonb_build_object('squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0))
  returning * into created_session;
  return jsonb_build_object('organization_id', created_org.id, 'ranka_id', created_ranka.id, 'session_id', created_session.id);
end;
$$;

insert into public.platform_admins(user_id, created_by)
select sole_owner, sole_owner
from (select min(owner_user_id::text)::uuid as sole_owner, count(distinct owner_user_id) as owner_count from public.organizations) owners
where owner_count = 1 and sole_owner is not null
on conflict (user_id) do update set active = true, deactivated_at = null;

alter table public.commercial_plan_settings enable row level security;
alter table public.owner_entitlements enable row level security;
revoke all on table public.commercial_plan_settings from public, anon, authenticated;
revoke all on table public.owner_entitlements from public, anon, authenticated;

create or replace function public.platform_health_check()
returns jsonb
language sql
security definer
volatile
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok', 'database', 'reachable', 'serverTime', clock_timestamp(), 'schemaVersion', '20261103001700');
$$;

revoke all on function public.platform_health_check() from public;
grant execute on function public.platform_health_check() to anon, authenticated;

commit;
