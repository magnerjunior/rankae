begin;

alter table public.owner_entitlements add column trial_ranka_limit integer check (trial_ranka_limit between 1 and 100);
alter table public.owner_entitlements add column trial_expires_at timestamptz;
alter table public.owner_entitlements add constraint owner_entitlements_trial_pair
  check ((trial_ranka_limit is null) = (trial_expires_at is null));

create table public.platform_receipts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  received_on date not null,
  reference text not null check (char_length(trim(reference)) between 8 and 500)
);
alter table public.platform_receipts enable row level security;
revoke all on public.platform_receipts from public, anon, authenticated;

create function private.effective_ranka_limit(p_user_id uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce((
    select greatest(ranka_limit, case when trial_expires_at > now() then trial_ranka_limit else ranka_limit end)
    from public.owner_entitlements where owner_user_id = p_user_id
  ), 1);
$$;
revoke all on function private.effective_ranka_limit(uuid) from public, anon, authenticated;

create function public.admin_grant_ranka_trial(p_user_id uuid, p_limit integer, p_days integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare expiration timestamptz;
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_user_id is null or p_limit is null or p_limit not between 1 and 100 or p_days is null or p_days not between 1 and 365
    or p_reason is null or char_length(trim(p_reason)) not between 8 and 500 then
    raise exception 'Invalid trial' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  expiration := now() + make_interval(days => p_days);
  insert into public.owner_entitlements (owner_user_id, trial_ranka_limit, trial_expires_at, updated_by)
  values (p_user_id, p_limit, expiration, (select auth.uid()))
  on conflict (owner_user_id) do update set trial_ranka_limit = excluded.trial_ranka_limit,
    trial_expires_at = excluded.trial_expires_at, updated_by = excluded.updated_by, updated_at = now();
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome, metadata)
  values ((select auth.uid()), 'grant_ranka_trial', trim(p_reason), 'user', p_user_id, 'completed', jsonb_build_object('limit', p_limit, 'expiresAt', expiration));
end;
$$;

create function public.admin_record_receipt(p_user_id uuid, p_amount_cents integer, p_received_on date, p_reference text, p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_received_on > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Invalid receipt date' using errcode = '22023'; end if;
  insert into public.platform_receipts values (p_request_id, p_user_id, p_amount_cents, p_received_on, trim(p_reference))
  on conflict (id) do nothing;
  if not found then return; end if;
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome)
  values ((select auth.uid()), 'record_receipt', 'Registro de recebimento manual', 'receipt', p_request_id, 'completed');
end;
$$;

create function public.admin_audit_organizer_invite() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, outcome)
  values ((select auth.uid()), 'invite_organizer', 'Convite solicitado pelo painel', 'user', 'allowed');
end;
$$;

create function public.admin_get_accounts_and_receipts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare month_start date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'limit', coalesce(e.ranka_limit, 1), 'used', coalesce(c.used, 0),
      'trialLimit', e.trial_ranka_limit, 'expiresAt', e.trial_expires_at, 'trialActive', coalesce(e.trial_expires_at > now(), false)
    ) order by u.email) from auth.users u left join public.owner_entitlements e on e.owner_user_id = u.id
    left join (select o.owner_user_id, count(*) as used from public.rankas r join public.organizations o on o.id = r.org_id group by o.owner_user_id) c on c.owner_user_id = u.id
    where u.email is not null), '[]'::jsonb),
    'activeTrials', (select count(*) from public.owner_entitlements where trial_expires_at > now()),
    'total', (select coalesce(sum(amount_cents), 0) from public.platform_receipts),
    'month', (select coalesce(sum(amount_cents), 0) from public.platform_receipts where received_on >= month_start and received_on < month_start + interval '1 month'),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'email', u.email, 'amount', r.amount_cents, 'date', r.received_on, 'reference', r.reference) order by r.received_on desc, r.id)
      from (select * from public.platform_receipts order by received_on desc, id limit 50) r join auth.users u on u.id = r.user_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_grant_ranka_trial(uuid,integer,integer,text), public.admin_record_receipt(uuid,integer,date,text,uuid), public.admin_audit_organizer_invite(), public.admin_get_accounts_and_receipts() from public, anon;
grant execute on function public.admin_grant_ranka_trial(uuid,integer,integer,text), public.admin_record_receipt(uuid,integer,date,text,uuid), public.admin_audit_organizer_invite(), public.admin_get_accounts_and_receipts() to authenticated;

create or replace function public.get_ranka_entitlement()
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
  allowed := private.effective_ranka_limit(actor_id);
  select count(*)::integer into used
  from public.rankas r join public.organizations o on o.id = r.org_id
  where o.owner_user_id = actor_id;
  return jsonb_build_object('limit', allowed, 'used', used, 'canCreate', used < allowed);
end;
$$;

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
  allowed := private.effective_ranka_limit(actor_id);
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
  allowed := private.effective_ranka_limit(actor_id);
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

commit;
