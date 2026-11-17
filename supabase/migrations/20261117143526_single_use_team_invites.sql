begin;
alter table private.team_invites alter column email drop not null;

create function public.create_open_team_invite(p_org_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.organizations%rowtype; invitation uuid;
begin
  select * into target from public.organizations where id=p_org_id and owner_user_id=(select auth.uid()) for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  if (select count(*) from public.organization_members where org_id=target.id and role='organizer' and active)
    + (select count(*) from private.team_invites where org_id=target.id and closed_at is null and expires_at>now()) >= target.collaborator_limit
    then raise exception 'Collaborator limit reached' using errcode='PT409'; end if;
  insert into private.team_invites(org_id,email) values(target.id,null) returning id into invitation;
  return invitation;
end;
$$;
revoke all on function public.create_open_team_invite(uuid) from public,anon;
grant execute on function public.create_open_team_invite(uuid) to authenticated;

create function public.team_invite_open(p_invite uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.team_invites where id=p_invite and closed_at is null and expires_at>now());
$$;
revoke all on function public.team_invite_open(uuid) from public;
grant execute on function public.team_invite_open(uuid) to anon,authenticated;

create function private.redeem_team_invite(p_invite uuid,p_actor uuid,p_email text) returns void
language plpgsql set search_path = '' as $$
declare target private.team_invites%rowtype; organization public.organizations%rowtype;
begin
  select o.* into organization from public.organizations o join private.team_invites i on i.org_id=o.id where i.id=p_invite for update of o;
  select * into target from private.team_invites where id=p_invite and closed_at is null and expires_at>now() for update;
  if not found or organization.id is null then raise exception 'Invite is unavailable' using errcode='PT404'; end if;
  if p_actor is null or p_email is null or (target.email is not null and lower(p_email)<>target.email) then
    raise exception 'Invite belongs to another email' using errcode='42501';
  end if;
  if organization.owner_user_id=p_actor or exists(select 1 from public.organization_members where org_id=organization.id and user_id=p_actor and active)
    then raise exception 'This account is already on the team' using errcode='PT409'; end if;
  if (select count(*) from public.organization_members where org_id=organization.id and role='organizer' and active) >= organization.collaborator_limit
    then raise exception 'Collaborator limit reached' using errcode='PT409'; end if;
  insert into public.organization_members(org_id,user_id,role,workspace_access) values(organization.id,p_actor,'organizer',true)
    on conflict(org_id,user_id) do update set active=true,workspace_access=true where public.organization_members.role='organizer';
  if not found then raise exception 'Membership role cannot be changed by invite' using errcode='42501'; end if;
  update private.team_invites set closed_at=now() where id=target.id;
end;
$$;
revoke all on function private.redeem_team_invite(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.accept_team_invite(p_invite uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); account auth.users%rowtype;
begin
  select * into account from auth.users where id=actor and email_confirmed_at is not null;
  if not found then raise exception 'Sign in with a confirmed account' using errcode='42501'; end if;
  perform private.redeem_team_invite(p_invite,actor,account.email);
  return jsonb_build_object('needsPassword',coalesce(account.encrypted_password,'')='');
end;
$$;

create function private.consume_invite_on_account_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.redeem_team_invite((new.raw_app_meta_data->>'rankae_team_invite')::uuid,new.id,new.email);
  return new;
end;
$$;
revoke all on function private.consume_invite_on_account_creation() from public,anon,authenticated;
create trigger users_consume_single_use_invite after insert on auth.users
for each row when (new.raw_app_meta_data->>'rankae_team_invite' is not null)
execute function private.consume_invite_on_account_creation();
commit;
