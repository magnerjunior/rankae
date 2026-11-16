begin;

alter table public.owner_entitlements
  add column account_name text check (char_length(trim(account_name)) between 2 and 100),
  add column account_mode text not null default 'active' check (account_mode in ('active', 'trial')),
  add column paying boolean not null default false,
  add column trial_session_limit integer check (trial_session_limit between 1 and 100),
  add column trial_started_at timestamptz,
  add constraint owner_entitlements_trial_mode check (
    (account_mode = 'trial' and not paying and trial_session_limit is not null and trial_started_at is not null
      and trial_ranka_limit is not null and trial_expires_at is not null and trial_expires_at > trial_started_at)
    or (account_mode = 'active' and trial_session_limit is null and trial_started_at is null)
  );

create index if not exists organizations_owner_user_id_idx on public.organizations(owner_user_id);

-- Creation is already routed through the existing transactional RPCs.
revoke insert on public.rankas, public.sessions from authenticated;
revoke update (state) on public.sessions from authenticated;

create function private.trial_session_usage(p_owner uuid, p_started_at timestamptz, p_ranka uuid default null)
returns table (used integer, played_today boolean, open_today boolean, open_in_ranka boolean)
language sql stable set search_path = '' as $$
  select count(*)::integer, coalesce(bool_or(s.scheduled_on = (now() at time zone 'America/Sao_Paulo')::date), false),
    coalesce(bool_or(s.state <> 'completed'
    and s.scheduled_on = (now() at time zone 'America/Sao_Paulo')::date), false),
    coalesce(bool_or(s.state <> 'completed'
    and s.scheduled_on = (now() at time zone 'America/Sao_Paulo')::date
    and (p_ranka is null or s.ranka_id = p_ranka)), false)
  from public.sessions s join public.organizations o on o.id = s.org_id
  where o.owner_user_id = p_owner and s.created_at >= p_started_at;
$$;

create function public.get_account_trial(p_ranka_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  entitlement public.owner_entitlements%rowtype;
  usage record;
  remaining integer;
  expired boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_ranka_id is not null then
    if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
    select o.owner_user_id into owner_id from public.rankas r join public.organizations o on o.id = r.org_id where r.id = p_ranka_id;
  end if;
  select * into entitlement from public.owner_entitlements where owner_user_id = owner_id and account_mode = 'trial';
  if not found then return null; end if;
  select * into usage from private.trial_session_usage(owner_id, entitlement.trial_started_at, p_ranka_id);
  remaining := greatest(0, entitlement.trial_session_limit - usage.used);
  expired := entitlement.trial_expires_at <= now();
  return jsonb_build_object('remaining', remaining, 'daysLeft', greatest(0, ceil(extract(epoch from (entitlement.trial_expires_at - now())) / 86400)::integer),
    'ended', expired or (remaining = 0 and not usage.open_today),
    'canStart', not expired and remaining > 0 and not usage.played_today,
    'canPlayToday', not expired and usage.open_in_ranka);
end;
$$;

create or replace function private.effective_ranka_limit(p_user_id uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce((select case
    when e.account_mode = 'trial' then case when e.trial_expires_at > now() and (
      select used < e.trial_session_limit from private.trial_session_usage(e.owner_user_id, e.trial_started_at)
    ) then e.trial_ranka_limit else 0 end
    when e.trial_expires_at > now() then greatest(e.ranka_limit, e.trial_ranka_limit)
    else e.ranka_limit end
    from public.owner_entitlements e where e.owner_user_id = p_user_id), 1);
$$;

create function private.enforce_trial_session_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; entitlement public.owner_entitlements%rowtype; usage record;
begin
  select owner_user_id into owner_id from public.organizations where id = new.org_id;
  perform pg_advisory_xact_lock(hashtext(owner_id::text));
  select * into entitlement from public.owner_entitlements where owner_user_id = owner_id and account_mode = 'trial';
  if not found then return new; end if;
  select * into usage from private.trial_session_usage(owner_id, entitlement.trial_started_at);
  if entitlement.trial_expires_at <= now() or usage.used >= entitlement.trial_session_limit or usage.played_today
    or new.scheduled_on <> (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Trial does not allow a new football day' using errcode = 'PT402';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger sessions_enforce_trial_creation before insert on public.sessions
for each row execute function private.enforce_trial_session_creation();

create function private.enforce_trial_match_day() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.state = old.state or new.state not in ('live', 'overtime_live') then return new; end if;
  end if;
  if exists (select 1 from public.sessions s join public.organizations o on o.id = s.org_id
    join public.owner_entitlements e on e.owner_user_id = o.owner_user_id and e.account_mode = 'trial'
    where s.id = new.session_id and (e.trial_expires_at <= now() or s.created_at < e.trial_started_at
      or s.scheduled_on <> (now() at time zone 'America/Sao_Paulo')::date or s.state = 'completed')) then
    raise exception 'Trial does not allow play outside the authorized football day' using errcode = 'PT402';
  end if;
  return new;
end;
$$;

create trigger matches_enforce_trial_day before insert or update of state on public.matches
for each row execute function private.enforce_trial_match_day();

create function public.admin_configure_account(p_user_id uuid, p_name text, p_mode text,
  p_ranka_limit integer, p_paying boolean, p_session_limit integer, p_trial_days integer) returns void
language plpgsql security definer set search_path = '' as $$
declare started_at timestamptz;
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_user_id is null or p_name is null or char_length(trim(p_name)) not between 2 and 100
    or p_mode is null or p_mode not in ('trial', 'active') or p_ranka_limit is null or p_ranka_limit not between 1 and 100
    or p_paying is null or (p_mode = 'trial' and (p_paying or p_session_limit is null or p_session_limit not between 1 and 100
      or p_trial_days is null or p_trial_days not between 1 and 365)) then
    raise exception 'Invalid account settings' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if p_mode = 'trial' then
    select trial_started_at into started_at from public.owner_entitlements where owner_user_id = p_user_id;
    started_at := coalesce(started_at, now());
  end if;
  insert into public.owner_entitlements(owner_user_id, account_name, account_mode, ranka_limit, paying,
    trial_ranka_limit, trial_session_limit, trial_started_at, trial_expires_at, updated_by)
  values (p_user_id, trim(p_name), p_mode, p_ranka_limit, p_paying,
    case when p_mode = 'trial' then p_ranka_limit end,
    case when p_mode = 'trial' then p_session_limit end, started_at,
    case when p_mode = 'trial' then started_at + make_interval(days => p_trial_days) end, (select auth.uid()))
  on conflict (owner_user_id) do update set account_name = excluded.account_name, account_mode = excluded.account_mode,
    ranka_limit = excluded.ranka_limit, paying = excluded.paying, trial_ranka_limit = excluded.trial_ranka_limit,
    trial_session_limit = excluded.trial_session_limit, trial_started_at = excluded.trial_started_at,
    trial_expires_at = excluded.trial_expires_at, updated_by = excluded.updated_by, updated_at = now();
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome, metadata)
  values ((select auth.uid()), 'configure_account', 'Condições de acesso definidas no painel', 'user', p_user_id, 'completed',
    jsonb_build_object('mode', p_mode, 'paying', p_paying, 'rankaLimit', p_ranka_limit, 'sessionLimit', p_session_limit, 'trialDays', p_trial_days));
end;
$$;

create function public.admin_get_account_profiles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', e.account_name,
    'mode', coalesce(e.account_mode, 'active'), 'paying', coalesce(e.paying, false)) order by u.email)
    from auth.users u left join public.owner_entitlements e on e.owner_user_id = u.id where u.email is not null), '[]'::jsonb);
end;
$$;

create function public.admin_get_account_detail(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('email', u.email, 'name', e.account_name, 'createdAt', u.created_at,
    'mode', coalesce(e.account_mode, 'active'), 'paying', coalesce(e.paying, false),
    'rankaLimit', coalesce(e.ranka_limit, 1), 'sessionLimit', e.trial_session_limit, 'expiresAt', e.trial_expires_at,
    'trialDays', case when e.trial_started_at is not null then ceil(extract(epoch from (e.trial_expires_at - e.trial_started_at)) / 86400)::integer end,
    'sessionUsed', case when e.trial_started_at is not null then (select used from private.trial_session_usage(u.id, e.trial_started_at)) end,
    'rankas', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'organization', o.name,
      'publicSlug', case when r.visibility = 'public' then r.slug end, 'visibility', r.visibility,
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', d.scheduled_on, 'state', d.state,
        'matches', (select count(*) from public.matches m where m.session_id = d.id)) order by d.scheduled_on desc, d.session_number desc)
        from (select id, scheduled_on, state, session_number from public.sessions where ranka_id = r.id order by scheduled_on desc, session_number desc limit 5) d), '[]'::jsonb)
    ) order by r.created_at desc) from public.organizations o join public.rankas r on r.org_id = o.id where o.owner_user_id = u.id), '[]'::jsonb))
    into result from auth.users u left join public.owner_entitlements e on e.owner_user_id = u.id where u.id = p_user_id;
  if result is null then return null; end if;
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome)
  values ((select auth.uid()), 'view_account_detail', 'Acompanhamento de conta no painel', 'user', p_user_id, 'allowed');
  return result;
end;
$$;

revoke all on function private.trial_session_usage(uuid,timestamptz,uuid), private.enforce_trial_session_creation(), private.enforce_trial_match_day() from public, anon, authenticated;
revoke all on function public.get_account_trial(uuid), public.admin_configure_account(uuid,text,text,integer,boolean,integer,integer), public.admin_get_account_profiles(), public.admin_get_account_detail(uuid) from public, anon;
grant execute on function public.get_account_trial(uuid), public.admin_configure_account(uuid,text,text,integer,boolean,integer,integer), public.admin_get_account_profiles(), public.admin_get_account_detail(uuid) to authenticated;


-- A conta teste cria o ranka sem iniciar o primeiro dia de futebol.
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
  if not exists (select 1 from public.owner_entitlements where owner_user_id = actor_id and account_mode = 'trial') then
    insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
    values (created_ranka.id, p_org_id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
      jsonb_build_object('squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
        'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
        'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0))
    returning * into created_session;
  end if;
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
  if not exists (select 1 from public.owner_entitlements where owner_user_id = actor_id and account_mode = 'trial') then
    insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year, rules_snapshot)
    values (created_ranka.id, created_org.id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer,
      jsonb_build_object('squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
        'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
        'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0))
    returning * into created_session;
  end if;
  return jsonb_build_object('organization_id', created_org.id, 'ranka_id', created_ranka.id, 'session_id', created_session.id);
end;
$$;

commit;
