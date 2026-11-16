begin;

alter table public.organizations add column collaborator_limit integer not null default 3 check (collaborator_limit between 0 and 50);
alter table public.organization_members add column workspace_access boolean not null default false;

-- Membership mutations go through the quota-checked RPCs. Legacy assignments remain readable.
revoke insert on public.organizations from authenticated;
revoke insert, delete, update on public.organization_members, public.ranka_organizers from authenticated;
revoke update (role, active) on public.organization_members from authenticated;
revoke update (role) on public.ranka_organizers from authenticated;

create table private.team_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(trim(email))),
  expires_at timestamptz not null default (now() + interval '7 days'),
  closed_at timestamptz,
  last_delivery_at timestamptz
);
revoke all on private.team_invites from public, anon, authenticated;
create unique index team_invites_open_email_idx on private.team_invites(org_id, email) where closed_at is null;
create index team_invites_expiry_idx on private.team_invites(expires_at);

alter table public.owner_entitlements drop constraint owner_entitlements_account_mode_check;
alter table public.owner_entitlements add constraint owner_entitlements_account_mode_check check (account_mode in ('active', 'trial', 'collaborator'));
alter table public.owner_entitlements drop constraint owner_entitlements_trial_mode;
alter table public.owner_entitlements add constraint owner_entitlements_trial_mode check (
  (account_mode = 'trial' and not paying and trial_session_limit is not null and trial_started_at is not null
    and trial_ranka_limit is not null and trial_expires_at is not null and trial_expires_at > trial_started_at)
  or (account_mode in ('active', 'collaborator') and trial_session_limit is null and trial_started_at is null)
);

create or replace function private.effective_ranka_limit(p_user_id uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce((select case
    when e.account_mode = 'collaborator' then 0
    when e.account_mode = 'trial' then case when e.trial_expires_at > now() and (
      select used < e.trial_session_limit from private.trial_session_usage(e.owner_user_id, e.trial_started_at)
    ) then e.trial_ranka_limit else 0 end
    when e.trial_expires_at > now() then greatest(e.ranka_limit, e.trial_ranka_limit)
    else e.ranka_limit end
    from public.owner_entitlements e where e.owner_user_id = p_user_id), 1);
$$;

create or replace function private.can_manage_ranka(target_ranka_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rankas r join public.organizations o on o.id = r.org_id
    where r.id = target_ranka_id and o.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.rankas r join public.organization_members m on m.org_id = r.org_id
    where r.id = target_ranka_id and m.user_id = (select auth.uid()) and m.active and m.workspace_access and m.role = 'organizer'
  ) or exists (
    select 1 from public.ranka_organizers ro join public.organization_members m on m.id = ro.member_id and m.org_id = ro.org_id
    where ro.ranka_id = target_ranka_id and m.user_id = (select auth.uid()) and m.active
  );
$$;

create function public.get_owned_teams() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'limit', o.collaborator_limit,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'email', u.email) order by u.email)
      from public.organization_members m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.role = 'organizer' and m.active), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expiresAt', i.expires_at) order by i.expires_at)
      from private.team_invites i where i.org_id = o.id and i.closed_at is null and i.expires_at > now()), '[]'::jsonb)) order by o.name), '[]'::jsonb)
  from public.organizations o where o.owner_user_id = (select auth.uid());
$$;

create function public.create_team_invite(p_org_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.organizations%rowtype; recipient text := lower(trim(p_email)); invite_id uuid;
begin
  select * into target from public.organizations where id = p_org_id and owner_user_id = (select auth.uid()) for update;
  if not found then raise exception 'Only the owner can invite collaborators' using errcode = '42501'; end if;
  if recipient is null or char_length(recipient) > 254 or recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id and m.active and lower(u.email) = recipient) then
    raise exception 'This account is already on the team' using errcode = 'PT409';
  end if;
  update private.team_invites set closed_at = now() where org_id = p_org_id and email = recipient and closed_at is null and expires_at <= now();
  select id into invite_id from private.team_invites where org_id = p_org_id and email = recipient and closed_at is null;
  if found then return invite_id; end if;
  if (select count(*) from public.organization_members where org_id = p_org_id and role = 'organizer' and active)
    + (select count(*) from private.team_invites where org_id = p_org_id and closed_at is null and expires_at > now()) >= target.collaborator_limit then
    raise exception 'Collaborator limit reached' using errcode = 'PT409';
  end if;
  insert into private.team_invites(org_id, email) values (p_org_id, recipient) returning id into invite_id;
  return invite_id;
end;
$$;

create function public.remove_team_access(p_org_id uuid, p_target uuid, p_invite boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.organizations where id = p_org_id and owner_user_id = (select auth.uid()) for update;
  if not found then raise exception 'Only the owner can manage team access' using errcode = '42501'; end if;
  if p_invite then
    update private.team_invites set closed_at = now() where id = p_target and org_id = p_org_id and closed_at is null;
  else
    update public.organization_members set active = false where id = p_target and org_id = p_org_id and role = 'organizer';
  end if;
end;
$$;

create function public.team_invite_delivery(p_invite uuid, p_request_code boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target private.team_invites%rowtype;
begin
  select * into target from private.team_invites where id = p_invite and closed_at is null and expires_at > now() for update;
  if not found then return null; end if;
  if p_request_code then
    if target.last_delivery_at > now() - interval '60 seconds' then raise exception 'Wait before requesting another code' using errcode = 'PT429'; end if;
    update private.team_invites set last_delivery_at = now() where id = target.id;
  end if;
  return jsonb_build_object('email', target.email, 'exists', exists(select 1 from auth.users where lower(email) = target.email));
end;
$$;

create function private.register_team_invitee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.owner_entitlements(owner_user_id, account_mode) values (new.id, 'collaborator')
  on conflict (owner_user_id) do nothing;
  return new;
end;
$$;
create trigger users_register_team_invitee after insert on auth.users
for each row when (new.raw_app_meta_data ->> 'rankae_team_only' = 'true') execute function private.register_team_invitee();

create function public.accept_team_invite(p_invite uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); target private.team_invites%rowtype; organization public.organizations%rowtype; needs_password boolean;
begin
  select o.* into organization from public.organizations o join private.team_invites i on i.org_id = o.id where i.id = p_invite for update of o;
  if not found then raise exception 'Invite is unavailable' using errcode = 'PT404'; end if;
  select * into target from private.team_invites where id = p_invite and closed_at is null and expires_at > now() for update;
  if not found then raise exception 'Invite is unavailable' using errcode = 'PT404'; end if;
  select coalesce(u.encrypted_password, '') = '' into needs_password from auth.users u
    where u.id = actor and u.email_confirmed_at is not null and lower(u.email) = target.email;
  if not found then raise exception 'Invite belongs to another email' using errcode = '42501'; end if;
  if (select count(*) from public.organization_members where org_id = target.org_id and role = 'organizer' and active) >= organization.collaborator_limit then
    raise exception 'Collaborator limit reached' using errcode = 'PT409';
  end if;
  insert into public.organization_members(org_id, user_id, role, workspace_access) values (target.org_id, actor, 'organizer', true)
  on conflict (org_id, user_id) do update set active = true, workspace_access = true where public.organization_members.role = 'organizer';
  update private.team_invites set closed_at = now() where id = p_invite;
  return jsonb_build_object('needsPassword', needs_password);
end;
$$;

create function public.admin_set_team_limit(p_org_id uuid, p_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 0 and 50 then raise exception 'Invalid collaborator limit' using errcode = '22023'; end if;
  perform 1 from public.organizations where id = p_org_id for update;
  if not found then raise exception 'Organization not found' using errcode = 'PT404'; end if;
  if (select count(*) from public.organization_members where org_id = p_org_id and role = 'organizer' and active)
    + (select count(*) from private.team_invites where org_id = p_org_id and closed_at is null and expires_at > now()) > p_limit then
    raise exception 'Remove collaborators or pending invites before reducing the limit' using errcode = 'PT409';
  end if;
  update public.organizations set collaborator_limit = p_limit where id = p_org_id;
  insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome, metadata)
  values ((select auth.uid()), 'set_team_limit', 'Limite de colaboradores atualizado no painel', 'organization', p_org_id, 'completed', jsonb_build_object('limit', p_limit));
end;
$$;

create function public.admin_get_account_teams(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'limit', o.collaborator_limit,
    'used', (select count(*) from public.organization_members m where m.org_id = o.id and m.role = 'organizer' and m.active),
    'pending', (select count(*) from private.team_invites i where i.org_id = o.id and i.closed_at is null and i.expires_at > now())) order by o.name)
    from public.organizations o where o.owner_user_id = p_user_id), '[]'::jsonb);
end;
$$;

create function public.admin_get_ranka_review(p_ranka_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('name', r.name, 'organization', o.name, 'ownerId', o.owner_user_id,
    'publicSlug', case when r.visibility = 'public' then r.slug end,
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', s.scheduled_on, 'number', s.session_number, 'state', s.state,
      'matches', (select count(*) from public.matches m where m.session_id = s.id),
      'manualReview', (select count(*) from public.matches m where m.session_id = s.id and m.state = 'manual_review'))
      order by s.scheduled_on desc, s.session_number desc)
      from (select id, scheduled_on, session_number, state from public.sessions where ranka_id = r.id
        order by scheduled_on desc, session_number desc limit 20) s), '[]'::jsonb))
    into result from public.rankas r join public.organizations o on o.id = r.org_id where r.id = p_ranka_id;
  if result is not null then
    insert into public.privileged_access_audit(actor_id, action, reason, resource_type, resource_id, outcome)
    values ((select auth.uid()), 'view_ranka_review', 'Consulta operacional de ranka no painel', 'ranka', p_ranka_id, 'allowed');
  end if;
  return result;
end;
$$;

revoke all on function public.get_owned_teams(), public.create_team_invite(uuid,text), public.remove_team_access(uuid,uuid,boolean),
  public.accept_team_invite(uuid), public.admin_set_team_limit(uuid,integer), public.admin_get_account_teams(uuid), public.admin_get_ranka_review(uuid) from public, anon;
grant execute on function public.get_owned_teams(), public.create_team_invite(uuid,text), public.remove_team_access(uuid,uuid,boolean),
  public.accept_team_invite(uuid), public.admin_set_team_limit(uuid,integer), public.admin_get_account_teams(uuid), public.admin_get_ranka_review(uuid) to authenticated;
revoke all on function private.register_team_invitee(), public.team_invite_delivery(uuid,boolean) from public, anon, authenticated;
grant execute on function public.team_invite_delivery(uuid,boolean) to service_role;

commit;
