begin;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.organization_member_role as enum ('owner', 'organizer');
create type public.ranka_organizer_role as enum ('owner', 'coorganizer');
create type public.ranka_visibility as enum ('public', 'unlisted', 'pin_protected', 'private_off');
create type public.player_status as enum ('active', 'inactive', 'hidden');
create type public.session_state as enum ('planned', 'check_in', 'team_formation', 'running', 'paused', 'completed');
create type public.attendance_status as enum ('present', 'temporarily_out', 'left', 'no_show', 'inactive');
create type public.player_role_preference as enum ('line', 'keeper', 'either');

create function private.normalize_name(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(trim(value),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', ' ', 'g'
  );
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id),
  unique (id, org_id)
);

create index organization_members_user_id_idx on public.organization_members(user_id) where active;

create table public.rankas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 100),
  timezone text not null default 'America/Sao_Paulo',
  visibility public.ranka_visibility not null default 'private_off',
  settings_json jsonb not null default '{}'::jsonb check (jsonb_typeof(settings_json) = 'object'),
  invite_token_hash text,
  pin_hash text,
  rules_version integer not null default 1 check (rules_version > 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  unique (id, org_id),
  check (visibility <> 'pin_protected' or pin_hash is not null)
);

create index rankas_org_id_idx on public.rankas(org_id);

create table public.ranka_organizers (
  id uuid primary key default gen_random_uuid(),
  ranka_id uuid not null references public.rankas(id) on delete cascade,
  member_id uuid not null,
  org_id uuid not null,
  role public.ranka_organizer_role not null,
  created_at timestamptz not null default now(),
  foreign key (member_id, org_id) references public.organization_members(id, org_id) on delete cascade,
  foreign key (ranka_id, org_id) references public.rankas(id, org_id) on delete cascade,
  unique (ranka_id, member_id)
);

create index ranka_organizers_member_id_idx on public.ranka_organizers(member_id);
create unique index ranka_organizers_single_owner_idx on public.ranka_organizers(ranka_id) where role = 'owner';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  normalized_name text generated always as (private.normalize_name(full_name)) stored,
  nickname text check (nickname is null or char_length(trim(nickname)) between 1 and 60),
  normalized_nickname text generated always as (case when nickname is null then null else private.normalize_name(nickname) end) stored,
  role_preference public.player_role_preference not null default 'line',
  status public.player_status not null default 'active',
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create index players_org_name_idx on public.players(org_id, normalized_name);
create index players_org_nickname_idx on public.players(org_id, normalized_nickname) where normalized_nickname is not null;

create table public.player_aliases (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  org_id uuid not null,
  alias text not null check (char_length(trim(alias)) between 1 and 80),
  normalized_alias text generated always as (private.normalize_name(alias)) stored,
  created_at timestamptz not null default now(),
  foreign key (player_id, org_id) references public.players(id, org_id) on delete cascade,
  unique (player_id, normalized_alias)
);

create index player_aliases_org_alias_idx on public.player_aliases(org_id, normalized_alias);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  ranka_id uuid not null references public.rankas(id) on delete cascade,
  org_id uuid not null,
  scheduled_on date not null,
  state public.session_state not null default 'planned',
  contribution_amount_cents integer not null default 0 check (contribution_amount_cents >= 0),
  rules_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(rules_snapshot) = 'object'),
  season_year integer not null check (season_year between 2000 and 2200),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ranka_id, org_id) references public.rankas(id, org_id) on delete cascade,
  unique (id, org_id),
  unique (ranka_id, scheduled_on)
);

create index sessions_ranka_date_idx on public.sessions(ranka_id, scheduled_on desc);
create index sessions_org_id_idx on public.sessions(org_id);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  org_id uuid not null,
  player_id uuid not null,
  arrival_index integer not null check (arrival_index > 0),
  arrived_at timestamptz not null default now(),
  status public.attendance_status not null default 'present',
  role_preference public.player_role_preference not null default 'line',
  idempotency_key uuid not null,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (session_id, org_id) references public.sessions(id, org_id) on delete cascade,
  foreign key (player_id, org_id) references public.players(id, org_id) on delete restrict,
  unique (session_id, player_id),
  unique (session_id, arrival_index),
  unique (session_id, idempotency_key)
);

create index attendance_session_status_idx on public.attendance(session_id, status, arrival_index);
create index attendance_player_id_idx on public.attendance(player_id);
create index attendance_org_id_idx on public.attendance(org_id);

create function private.user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select o.id
  from public.organizations o
  where o.owner_user_id = (select auth.uid())
  union
  select m.org_id
  from public.organization_members m
  where m.user_id = (select auth.uid()) and m.active;
$$;

create function private.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and target_org_id in (select private.user_org_ids());
$$;

create function private.can_manage_org(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = target_org_id and o.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = (select auth.uid())
      and m.active and m.role = 'organizer'
  );
$$;

create function private.can_manage_ranka(target_ranka_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.rankas r
    join public.organizations o on o.id = r.org_id
    where r.id = target_ranka_id and o.owner_user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.ranka_organizers ro
    join public.organization_members m on m.id = ro.member_id and m.org_id = ro.org_id
    where ro.ranka_id = target_ranka_id
      and m.user_id = (select auth.uid())
      and m.active
  );
$$;

revoke all on function private.user_org_ids() from public;
revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.can_manage_org(uuid) from public;
revoke all on function private.can_manage_ranka(uuid) from public;
grant execute on function private.user_org_ids() to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_manage_org(uuid) to authenticated;
grant execute on function private.can_manage_ranka(uuid) to authenticated;

create function private.add_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (org_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner');
  return new;
end;
$$;

create trigger organizations_add_owner
after insert on public.organizations
for each row execute function private.add_organization_owner();

create function private.validate_ranka_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_user_id uuid;
  organization_owner_id uuid;
  coorganizer_count integer;
begin
  select m.user_id, o.owner_user_id
    into member_user_id, organization_owner_id
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.id = new.member_id and m.org_id = new.org_id and m.active;

  if member_user_id is null then
    raise exception 'Organizer must be an active member of the same organization';
  end if;
  if new.role = 'owner' and member_user_id <> organization_owner_id then
    raise exception 'Only the organization owner can be ranka owner';
  end if;
  if new.role = 'coorganizer' then
    select count(*) into coorganizer_count
    from public.ranka_organizers ro
    where ro.ranka_id = new.ranka_id and ro.role = 'coorganizer' and ro.id <> new.id;
    if coorganizer_count >= 3 then
      raise exception 'A ranka supports at most three coorganizers';
    end if;
  end if;
  return new;
end;
$$;

create trigger ranka_organizers_validate
before insert or update on public.ranka_organizers
for each row execute function private.validate_ranka_organizer();

create function private.prevent_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id <> old.org_id then
    raise exception 'organization_id is immutable';
  end if;
  return new;
end;
$$;

create trigger organization_members_tenant_immutable before update on public.organization_members
for each row execute function private.prevent_tenant_change();
create trigger rankas_tenant_immutable before update on public.rankas
for each row execute function private.prevent_tenant_change();
create trigger ranka_organizers_tenant_immutable before update on public.ranka_organizers
for each row execute function private.prevent_tenant_change();
create trigger players_tenant_immutable before update on public.players
for each row execute function private.prevent_tenant_change();
create trigger player_aliases_tenant_immutable before update on public.player_aliases
for each row execute function private.prevent_tenant_change();
create trigger sessions_tenant_immutable before update on public.sessions
for each row execute function private.prevent_tenant_change();
create trigger attendance_tenant_immutable before update on public.attendance
for each row execute function private.prevent_tenant_change();

create function public.create_ranka_workspace(
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
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(trim(p_organization_name)) < 2 or char_length(trim(p_ranka_name)) < 2 then
    raise exception 'Organization and ranka names are required' using errcode = '22023';
  end if;
  if p_ranka_slug <> lower(p_ranka_slug) or p_ranka_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid ranka slug' using errcode = '22023';
  end if;

  insert into public.organizations (name, owner_user_id)
  values (trim(p_organization_name), actor_id)
  returning * into created_org;

  select * into owner_member from public.organization_members
  where org_id = created_org.id and user_id = actor_id;

  insert into public.rankas (org_id, slug, name)
  values (created_org.id, p_ranka_slug, trim(p_ranka_name))
  returning * into created_ranka;

  insert into public.ranka_organizers (ranka_id, member_id, org_id, role)
  values (created_ranka.id, owner_member.id, created_org.id, 'owner');

  insert into public.sessions (ranka_id, org_id, scheduled_on, state, season_year)
  values (created_ranka.id, created_org.id, p_scheduled_on, 'check_in', extract(year from p_scheduled_on)::integer)
  returning * into created_session;

  return jsonb_build_object(
    'organization_id', created_org.id,
    'ranka_id', created_ranka.id,
    'session_id', created_session.id
  );
end;
$$;

revoke all on function public.create_ranka_workspace(text, text, text, date) from public, anon;
grant execute on function public.create_ranka_workspace(text, text, text, date) to authenticated;

create function public.create_player_with_aliases(
  p_org_id uuid,
  p_full_name text,
  p_nickname text default null,
  p_role public.player_role_preference default 'line',
  p_aliases text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.players%rowtype;
begin
  if not private.can_manage_org(p_org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  insert into public.players (org_id, full_name, nickname, role_preference)
  values (p_org_id, trim(p_full_name), nullif(trim(p_nickname), ''), p_role)
  returning * into created;

  insert into public.player_aliases (player_id, org_id, alias)
  select created.id, p_org_id, trim(value)
  from (select distinct unnest(p_aliases) as value) aliases
  where trim(value) <> '' and private.normalize_name(value) <> created.normalized_name;

  return to_jsonb(created);
end;
$$;

revoke all on function public.create_player_with_aliases(uuid, text, text, public.player_role_preference, text[]) from public, anon;
grant execute on function public.create_player_with_aliases(uuid, text, text, public.player_role_preference, text[]) to authenticated;

create function public.check_in_player(
  p_session_id uuid,
  p_player_id uuid,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.sessions%rowtype;
  existing public.attendance%rowtype;
  created public.attendance%rowtype;
  next_index integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into target_session from public.sessions where id = p_session_id for update;
  if target_session.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target_session.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;

  select * into existing from public.attendance
  where session_id = p_session_id and idempotency_key = p_idempotency_key;
  if existing.id is not null then return to_jsonb(existing); end if;

  if target_session.revision <> p_expected_revision then
    raise exception 'Revision conflict' using errcode = '40001', detail = target_session.revision::text;
  end if;
  if not exists (select 1 from public.players where id = p_player_id and org_id = target_session.org_id and status = 'active') then
    raise exception 'Eligible player not found in this organization' using errcode = '23503';
  end if;

  select coalesce(max(arrival_index), 0) + 1 into next_index
  from public.attendance where session_id = p_session_id;

  insert into public.attendance (
    session_id, org_id, player_id, arrival_index, role_preference, idempotency_key, created_by
  )
  select p_session_id, target_session.org_id, p.id, next_index, p.role_preference, p_idempotency_key, (select auth.uid())
  from public.players p where p.id = p_player_id
  returning * into created;

  update public.sessions set revision = revision + 1, updated_at = now() where id = p_session_id;
  return to_jsonb(created) || jsonb_build_object('session_revision', target_session.revision + 1);
end;
$$;

revoke all on function public.check_in_player(uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.check_in_player(uuid, uuid, bigint, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.rankas enable row level security;
alter table public.ranka_organizers enable row level security;
alter table public.players enable row level security;
alter table public.player_aliases enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update (name, revision, updated_at) on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update (name, timezone, visibility, settings_json, invite_token_hash, pin_hash, rules_version, revision, updated_at) on public.rankas to authenticated;
grant select, insert, update, delete on public.ranka_organizers to authenticated;
grant select, insert, update (full_name, nickname, role_preference, status, revision, updated_at) on public.players to authenticated;
grant select, insert, update, delete on public.player_aliases to authenticated;
grant select, insert, update (state, contribution_amount_cents, rules_snapshot, revision, updated_at) on public.sessions to authenticated;
grant select, update (status, role_preference, revision, updated_at) on public.attendance to authenticated;

create policy organizations_select on public.organizations for select to authenticated
using (id in (select private.user_org_ids()));
create policy organizations_insert on public.organizations for insert to authenticated
with check ((select auth.uid()) is not null and owner_user_id = (select auth.uid()));
create policy organizations_update on public.organizations for update to authenticated
using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

create policy organization_members_select on public.organization_members for select to authenticated
using (private.is_org_member(org_id));
create policy organization_members_insert on public.organization_members for insert to authenticated
with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));
create policy organization_members_update on public.organization_members for update to authenticated
using (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())))
with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));
create policy organization_members_delete on public.organization_members for delete to authenticated
using (role <> 'owner' and exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));

create policy rankas_select on public.rankas for select to authenticated
using (private.is_org_member(org_id));
create policy rankas_insert on public.rankas for insert to authenticated
with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));
create policy rankas_update on public.rankas for update to authenticated
using (private.can_manage_ranka(id)) with check (private.is_org_member(org_id));

create policy ranka_organizers_select on public.ranka_organizers for select to authenticated
using (private.is_org_member(org_id));
create policy ranka_organizers_insert on public.ranka_organizers for insert to authenticated
with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));
create policy ranka_organizers_update on public.ranka_organizers for update to authenticated
using (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())))
with check (exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));
create policy ranka_organizers_delete on public.ranka_organizers for delete to authenticated
using (role <> 'owner' and exists (select 1 from public.organizations o where o.id = org_id and o.owner_user_id = (select auth.uid())));

create policy players_select on public.players for select to authenticated
using (private.is_org_member(org_id));
create policy players_insert on public.players for insert to authenticated
with check (private.can_manage_org(org_id));
create policy players_update on public.players for update to authenticated
using (private.can_manage_org(org_id)) with check (private.can_manage_org(org_id));

create policy player_aliases_select on public.player_aliases for select to authenticated
using (private.is_org_member(org_id));
create policy player_aliases_insert on public.player_aliases for insert to authenticated
with check (private.can_manage_org(org_id));
create policy player_aliases_update on public.player_aliases for update to authenticated
using (private.can_manage_org(org_id)) with check (private.can_manage_org(org_id));
create policy player_aliases_delete on public.player_aliases for delete to authenticated
using (private.can_manage_org(org_id));

create policy sessions_select on public.sessions for select to authenticated
using (private.is_org_member(org_id));
create policy sessions_insert on public.sessions for insert to authenticated
with check (private.can_manage_ranka(ranka_id));
create policy sessions_update on public.sessions for update to authenticated
using (private.can_manage_ranka(ranka_id)) with check (private.can_manage_ranka(ranka_id));

create policy attendance_select on public.attendance for select to authenticated
using (private.is_org_member(org_id));
create policy attendance_update on public.attendance for update to authenticated
using (exists (select 1 from public.sessions s where s.id = session_id and private.can_manage_ranka(s.ranka_id)))
with check (exists (select 1 from public.sessions s where s.id = session_id and private.can_manage_ranka(s.ranka_id)));

commit;
