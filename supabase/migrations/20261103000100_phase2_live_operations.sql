begin;

create type public.squad_state as enum ('waiting', 'field', 'resting', 'archived');
create type public.field_side as enum ('yellow', 'red');
create type public.match_state as enum (
  'draft', 'ready', 'live', 'paused', 'regulation_ended',
  'overtime_live', 'overtime_paused', 'tie_break', 'completed',
  'cancelled', 'manual_review'
);
create type public.clock_phase as enum ('regulation', 'overtime');
create type public.match_assignment_role as enum ('line', 'keeper', 'borrowed_keeper', 'ball_boy');
create type public.match_event_type as enum ('goal', 'penalty_attempt', 'marker', 'tie_resolution');
create type public.match_event_status as enum ('active', 'void');
create type public.goal_kind as enum ('normal', 'penalty', 'own_goal');
create type public.penalty_outcome as enum ('converted', 'missed', 'saved');
create type public.contribution_status as enum ('pending', 'paid', 'waived');

alter table public.sessions
  add constraint sessions_id_ranka_org_unique unique (id, ranka_id, org_id);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  ranka_id uuid not null,
  org_id uuid not null,
  squad_number integer not null check (squad_number > 0),
  state public.squad_state not null default 'waiting',
  queue_position integer not null check (queue_position > 0),
  formation_method text not null check (formation_method in ('sequential', 'shuffle_blocks', 'manual')),
  shuffle_seed integer,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, ranka_id, org_id) references public.sessions(id, ranka_id, org_id) on delete cascade,
  unique (id, session_id, org_id),
  unique (session_id, squad_number),
  unique (session_id, queue_position)
);

create table public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null,
  session_id uuid not null,
  org_id uuid not null,
  player_id uuid not null,
  assignment_order integer not null check (assignment_order > 0),
  assignment_reason text not null default 'formation',
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_reason text,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  foreign key (squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete cascade,
  foreign key (player_id, org_id) references public.players(id, org_id) on delete restrict
);

create unique index squad_members_one_active_squad_idx
  on public.squad_members(session_id, player_id) where removed_at is null;
create index squad_members_squad_active_idx
  on public.squad_members(squad_id, assignment_order) where removed_at is null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  ranka_id uuid not null,
  org_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  yellow_squad_id uuid not null,
  red_squad_id uuid not null,
  state public.match_state not null default 'draft',
  clock_phase public.clock_phase not null default 'regulation',
  started_at_server timestamptz,
  elapsed_ms_before_start bigint not null default 0 check (elapsed_ms_before_start >= 0),
  paused_at timestamptz,
  regulation_duration_ms integer not null default 600000 check (regulation_duration_ms between 60000 and 7200000),
  overtime_duration_ms integer not null default 180000 check (overtime_duration_ms between 0 and 1800000),
  duration_limit_ms integer not null default 600000 check (duration_limit_ms between 0 and 7200000),
  rule_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_snapshot) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, ranka_id, org_id) references public.sessions(id, ranka_id, org_id) on delete cascade,
  foreign key (yellow_squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete restrict,
  foreign key (red_squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete restrict,
  unique (id, session_id, org_id),
  unique (session_id, ordinal),
  check (yellow_squad_id <> red_squad_id)
);

create unique index matches_one_active_per_session_idx on public.matches(session_id)
  where state not in ('completed', 'cancelled');
create index matches_session_ordinal_idx on public.matches(session_id, ordinal desc);

create table public.match_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  session_id uuid not null,
  org_id uuid not null,
  player_id uuid not null,
  squad_id uuid,
  field_side public.field_side,
  role public.match_assignment_role not null,
  start_ms bigint not null default 0 check (start_ms >= 0),
  end_ms bigint check (end_ms is null or end_ms >= start_ms),
  status text not null default 'confirmed' check (status in ('suggested', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  foreign key (match_id, session_id, org_id) references public.matches(id, session_id, org_id) on delete cascade,
  foreign key (squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete restrict,
  foreign key (player_id, org_id) references public.players(id, org_id) on delete restrict,
  check ((role = 'ball_boy' and field_side is null) or role <> 'ball_boy')
);

create unique index match_assignments_active_player_idx
  on public.match_assignments(match_id, player_id) where status <> 'cancelled' and end_ms is null;
create index match_assignments_match_role_idx on public.match_assignments(match_id, role, field_side);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  session_id uuid not null,
  org_id uuid not null,
  event_type public.match_event_type not null,
  side public.field_side,
  scorer_player_id uuid,
  assist_player_id uuid,
  keeper_player_id uuid,
  goal_kind public.goal_kind,
  penalty_outcome public.penalty_outcome,
  occurrence_ms bigint not null check (occurrence_ms >= 0),
  label text check (label is null or char_length(trim(label)) between 1 and 80),
  status public.match_event_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  idempotency_key uuid not null,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  foreign key (match_id, session_id, org_id) references public.matches(id, session_id, org_id) on delete cascade,
  foreign key (scorer_player_id, org_id) references public.players(id, org_id) on delete restrict,
  foreign key (assist_player_id, org_id) references public.players(id, org_id) on delete restrict,
  foreign key (keeper_player_id, org_id) references public.players(id, org_id) on delete restrict,
  unique (match_id, idempotency_key),
  check (scorer_player_id is null or scorer_player_id <> assist_player_id),
  check (
    (event_type = 'goal' and side is not null and goal_kind is not null and penalty_outcome is null)
    or (event_type = 'penalty_attempt' and side is not null and penalty_outcome is not null and goal_kind is null)
    or (event_type = 'marker' and label is not null and side is null and goal_kind is null and penalty_outcome is null)
    or (event_type = 'tie_resolution' and side is null and goal_kind is null and penalty_outcome is null)
  )
);

create index match_events_projection_idx on public.match_events(match_id, status, event_type, created_at);

create table public.substitutions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  match_id uuid,
  org_id uuid not null,
  source_squad_id uuid,
  target_squad_id uuid not null,
  outgoing_player_id uuid not null,
  incoming_player_id uuid not null,
  override_priority boolean not null default false,
  reason text not null check (char_length(trim(reason)) between 3 and 240),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (session_id, org_id) references public.sessions(id, org_id) on delete cascade,
  foreign key (match_id, session_id, org_id) references public.matches(id, session_id, org_id) on delete restrict,
  foreign key (source_squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete restrict,
  foreign key (target_squad_id, session_id, org_id) references public.squads(id, session_id, org_id) on delete restrict,
  foreign key (outgoing_player_id, org_id) references public.players(id, org_id) on delete restrict,
  foreign key (incoming_player_id, org_id) references public.players(id, org_id) on delete restrict,
  check (outgoing_player_id <> incoming_player_id)
);

create table public.contribution_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  org_id uuid not null,
  player_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0),
  status public.contribution_status not null default 'pending',
  note text check (note is null or char_length(note) <= 240),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, org_id) references public.sessions(id, org_id) on delete cascade,
  foreign key (player_id, org_id) references public.players(id, org_id) on delete restrict,
  unique (session_id, player_id)
);

create index contribution_records_session_status_idx on public.contribution_records(session_id, status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ranka_id uuid not null,
  session_id uuid not null,
  match_id uuid,
  action text not null check (char_length(action) between 2 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (session_id, ranka_id, org_id) references public.sessions(id, ranka_id, org_id) on delete cascade,
  foreign key (match_id, session_id, org_id) references public.matches(id, session_id, org_id) on delete restrict,
  unique (session_id, idempotency_key)
);

create index audit_logs_session_created_idx on public.audit_logs(session_id, created_at desc);

create function private.can_manage_session(target_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = target_session_id and private.can_manage_ranka(s.ranka_id)
  );
$$;

create function private.can_receive_session_topic(target_topic text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target_session_id uuid;
begin
  if target_topic !~ '^session:[0-9a-fA-F-]{36}$' then return false; end if;
  target_session_id := split_part(target_topic, ':', 2)::uuid;
  return private.can_manage_session(target_session_id);
exception when others then
  return false;
end;
$$;

revoke all on function private.can_manage_session(uuid) from public;
revoke all on function private.can_receive_session_topic(text) from public;
grant execute on function private.can_manage_session(uuid) to authenticated;
grant execute on function private.can_receive_session_topic(text) to authenticated;

create policy rankae_authenticated_receive_session_broadcast
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.can_receive_session_topic((select realtime.topic()))
);

create function private.broadcast_session_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  target_session_id uuid;
begin
  target_session_id := case
    when tg_table_name = 'sessions' then (payload ->> 'id')::uuid
    else (payload ->> 'session_id')::uuid
  end;
  perform realtime.broadcast_changes(
    'session:' || target_session_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create function private.current_match_elapsed(target public.matches, at_time timestamptz default clock_timestamp())
returns bigint
language sql
stable
set search_path = ''
as $$
  select greatest(0, target.elapsed_ms_before_start + case
    when target.state in ('live', 'overtime_live') and target.started_at_server is not null
      then floor(extract(epoch from (at_time - target.started_at_server)) * 1000)::bigint
    else 0
  end);
$$;

revoke all on function private.broadcast_session_change() from public, anon, authenticated;
revoke all on function private.current_match_elapsed(public.matches, timestamptz) from public, anon, authenticated;

create function public.create_player_with_aliases_confirmed(
  p_org_id uuid,
  p_full_name text,
  p_nickname text default null,
  p_role public.player_role_preference default 'line',
  p_aliases text[] default '{}'::text[],
  p_confirm_possible_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.players%rowtype;
  normalized_candidates text[];
  duplicate_exists boolean;
begin
  if not private.can_manage_org(p_org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if char_length(trim(p_full_name)) < 2 then raise exception 'Full name is required' using errcode = '22023'; end if;
  select array_agg(distinct private.normalize_name(value)) into normalized_candidates
  from unnest(array[p_full_name, p_nickname] || coalesce(p_aliases, '{}'::text[])) value
  where nullif(trim(value), '') is not null;
  select exists (
    select 1 from public.players p
    where p.org_id = p_org_id and p.status = 'active' and (
      p.normalized_name = any(normalized_candidates)
      or p.normalized_nickname = any(normalized_candidates)
      or exists (select 1 from public.player_aliases pa where pa.player_id = p.id and pa.normalized_alias = any(normalized_candidates))
    )
  ) into duplicate_exists;
  if duplicate_exists and not p_confirm_possible_duplicate then
    raise exception 'Possible duplicate requires confirmation' using errcode = '23505';
  end if;
  insert into public.players (org_id, full_name, nickname, role_preference)
  values (p_org_id, trim(p_full_name), nullif(trim(p_nickname), ''), p_role)
  returning * into created;
  insert into public.player_aliases (player_id, org_id, alias)
  select created.id, p_org_id, trim(value)
  from (select distinct unnest(p_aliases) as value) aliases
  where trim(value) <> '' and private.normalize_name(value) <> created.normalized_name;
  return to_jsonb(created) || jsonb_build_object('possible_duplicate_confirmed', duplicate_exists);
end;
$$;

create function public.generate_session_squads(
  p_session_id uuid,
  p_squad_size integer,
  p_method text,
  p_seed integer,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  created_count integer;
begin
  if p_squad_size not between 2 and 12 or p_method not in ('sequential', 'shuffle_blocks') then
    raise exception 'Invalid squad formation options' using errcode = '22023';
  end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.matches where session_id = p_session_id) then
    raise exception 'Squads cannot be regenerated after matches exist' using errcode = '55000';
  end if;

  delete from public.squads where session_id = p_session_id;

  with eligible as (
    select a.player_id,
      row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*,
      row_number() over (order by
        floor((e.arrival_order - 1)::numeric / (p_squad_size * 2)),
        case when p_method = 'shuffle_blocks' then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text) else lpad(e.arrival_order::text, 12, '0') end
      ) as formation_order
    from eligible e
  ), squad_numbers as (
    select distinct (floor((formation_order - 1)::numeric / p_squad_size)::integer + 1) as squad_number
    from ordered
  )
  insert into public.squads (session_id, ranka_id, org_id, squad_number, queue_position, formation_method, shuffle_seed)
  select p_session_id, target.ranka_id, target.org_id, squad_number, squad_number, p_method, case when p_method = 'shuffle_blocks' then coalesce(p_seed, 1) end
  from squad_numbers order by squad_number;

  with eligible as (
    select a.player_id,
      row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*,
      row_number() over (order by
        floor((e.arrival_order - 1)::numeric / (p_squad_size * 2)),
        case when p_method = 'shuffle_blocks' then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text) else lpad(e.arrival_order::text, 12, '0') end
      ) as formation_order
    from eligible e
  )
  insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
  select s.id, p_session_id, target.org_id, o.player_id,
    ((o.formation_order - 1) % p_squad_size + 1)::integer,
    p_method, (select auth.uid())
  from ordered o
  join public.squads s on s.session_id = p_session_id
    and s.squad_number = floor((o.formation_order - 1)::numeric / p_squad_size)::integer + 1;

  select count(*) into created_count from public.squads where session_id = p_session_id;
  update public.sessions set state = 'team_formation', revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'generate_squads', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('squad_size', p_squad_size, 'method', p_method, 'seed', p_seed, 'squad_count', created_count));
  return jsonb_build_object('session_revision', target.revision + 1, 'squad_count', created_count);
end;
$$;

create function public.set_attendance_status(
  p_session_id uuid,
  p_player_id uuid,
  p_status public.attendance_status,
  p_reason text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  update public.attendance set status = p_status, revision = revision + 1, updated_at = now()
  where session_id = p_session_id and player_id = p_player_id;
  if not found then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
  update public.sessions set revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.id, 'attendance_status', 'attendance', p_player_id, (select auth.uid()), p_idempotency_key, jsonb_build_object('status', p_status), nullif(trim(p_reason), ''));
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

create function public.substitute_squad_member(
  p_session_id uuid,
  p_target_squad_id uuid,
  p_outgoing_player_id uuid,
  p_incoming_player_id uuid,
  p_reason text,
  p_override_priority boolean,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  source_squad uuid;
  next_order integer;
begin
  if char_length(trim(p_reason)) < 3 then raise exception 'Reason is required' using errcode = '22023'; end if;
  if p_outgoing_player_id = p_incoming_player_id then raise exception 'Players must be different' using errcode = '22023'; end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if not exists (select 1 from public.squad_members where squad_id = p_target_squad_id and player_id = p_outgoing_player_id and removed_at is null) then raise exception 'Outgoing player not active in target squad' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.attendance where session_id = p_session_id and player_id = p_incoming_player_id and status = 'present') then raise exception 'Incoming player is not eligible' using errcode = '23514'; end if;

  select squad_id into source_squad from public.squad_members where session_id = p_session_id and player_id = p_incoming_player_id and removed_at is null;
  update public.squad_members set removed_at = now(), removed_reason = trim(p_reason)
  where session_id = p_session_id and player_id in (p_outgoing_player_id, p_incoming_player_id) and removed_at is null;
  select coalesce(max(assignment_order), 0) + 1 into next_order from public.squad_members where squad_id = p_target_squad_id;
  insert into public.squad_members (squad_id, session_id, org_id, player_id, assignment_order, assignment_reason, assigned_by)
  values (p_target_squad_id, p_session_id, target.org_id, p_incoming_player_id, next_order, 'substitution', (select auth.uid()));
  insert into public.substitutions (session_id, org_id, source_squad_id, target_squad_id, outgoing_player_id, incoming_player_id, override_priority, reason, created_by)
  values (p_session_id, target.org_id, source_squad, p_target_squad_id, p_outgoing_player_id, p_incoming_player_id, p_override_priority, trim(p_reason), (select auth.uid()));
  update public.sessions set revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.id, 'substitute_player', 'squad', p_target_squad_id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('outgoing_player_id', p_outgoing_player_id, 'incoming_player_id', p_incoming_player_id, 'source_squad_id', source_squad, 'override', p_override_priority), trim(p_reason));
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

create function public.prepare_next_match(
  p_session_id uuid,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.sessions%rowtype;
  yellow public.squads%rowtype;
  red public.squads%rowtype;
  created public.matches%rowtype;
  next_ordinal integer;
  regulation_ms integer;
  overtime_ms integer;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then
    select * into created from public.matches where session_id = p_session_id and state not in ('completed', 'cancelled') order by ordinal desc limit 1;
    return to_jsonb(created) || jsonb_build_object('idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (select 1 from public.matches where session_id = p_session_id and state not in ('completed', 'cancelled')) then raise exception 'An active match already exists' using errcode = '55000'; end if;

  select * into yellow from public.squads where session_id = p_session_id and state in ('waiting', 'field') order by queue_position limit 1;
  select * into red from public.squads where session_id = p_session_id and state in ('waiting', 'field') and id <> yellow.id order by queue_position limit 1;
  if yellow.id is null or red.id is null then raise exception 'Two squads are required' using errcode = '23514'; end if;
  select coalesce(max(ordinal), 0) + 1 into next_ordinal from public.matches where session_id = p_session_id;
  regulation_ms := coalesce((target.rules_snapshot ->> 'regulationDurationMs')::integer, 600000);
  overtime_ms := coalesce((target.rules_snapshot ->> 'overtimeDurationMs')::integer, 180000);
  insert into public.matches (session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state, regulation_duration_ms, overtime_duration_ms, duration_limit_ms, rule_snapshot)
  values (target.id, target.ranka_id, target.org_id, next_ordinal, yellow.id, red.id, 'ready', regulation_ms, overtime_ms, regulation_ms, target.rules_snapshot)
  returning * into created;
  update public.squads set state = 'field', updated_at = now() where id in (yellow.id, red.id);
  insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
  select created.id, target.id, target.org_id, sm.player_id, sm.squad_id,
    case when sm.squad_id = yellow.id then 'yellow'::public.field_side else 'red'::public.field_side end,
    'line', (select auth.uid())
  from public.squad_members sm where sm.squad_id in (yellow.id, red.id) and sm.removed_at is null;
  update public.sessions set state = 'running', revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, created.id, 'prepare_match', 'match', created.id, (select auth.uid()), p_idempotency_key, to_jsonb(created));
  return to_jsonb(created) || jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

create function public.confirm_match_officials(
  p_match_id uuid,
  p_yellow_keeper_id uuid,
  p_red_keeper_id uuid,
  p_ball_boy_ids uuid[],
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  participant uuid;
  assignments uuid[] := array_remove(array[p_yellow_keeper_id, p_red_keeper_id] || coalesce(p_ball_boy_ids, '{}'::uuid[]), null);
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.session_id and idempotency_key = p_idempotency_key) then return to_jsonb(target) || jsonb_build_object('idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if cardinality(assignments) <> (select count(distinct value) from unnest(assignments) value) then raise exception 'Duplicate official assignment' using errcode = '23505'; end if;
  foreach participant in array assignments loop
    if not exists (select 1 from public.attendance where session_id = target.session_id and player_id = participant and status = 'present') then raise exception 'Official is not present' using errcode = '23514'; end if;
    if exists (select 1 from public.match_assignments where match_id = target.id and player_id = participant and role = 'line' and status <> 'cancelled') then raise exception 'Field player cannot hold another role' using errcode = '23505'; end if;
  end loop;
  delete from public.match_assignments where match_id = target.id and role <> 'line';
  if p_yellow_keeper_id is not null then
    insert into public.match_assignments (match_id, session_id, org_id, player_id, field_side, role, created_by)
    values (target.id, target.session_id, target.org_id, p_yellow_keeper_id, 'yellow',
      case when exists (select 1 from public.players where id = p_yellow_keeper_id and role_preference = 'keeper') then 'keeper'::public.match_assignment_role else 'borrowed_keeper'::public.match_assignment_role end,
      (select auth.uid()));
  end if;
  if p_red_keeper_id is not null then
    insert into public.match_assignments (match_id, session_id, org_id, player_id, field_side, role, created_by)
    values (target.id, target.session_id, target.org_id, p_red_keeper_id, 'red',
      case when exists (select 1 from public.players where id = p_red_keeper_id and role_preference = 'keeper') then 'keeper'::public.match_assignment_role else 'borrowed_keeper'::public.match_assignment_role end,
      (select auth.uid()));
  end if;
  insert into public.match_assignments (match_id, session_id, org_id, player_id, role, created_by)
  select target.id, target.session_id, target.org_id, value, 'ball_boy', (select auth.uid()) from unnest(coalesce(p_ball_boy_ids, '{}'::uuid[])) value;
  update public.matches set revision = revision + 1, updated_at = now() where id = target.id returning * into target;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'confirm_officials', 'match', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('yellow_keeper_id', p_yellow_keeper_id, 'red_keeper_id', p_red_keeper_id, 'ball_boy_ids', coalesce(p_ball_boy_ids, '{}'::uuid[])));
  return to_jsonb(target);
end;
$$;

create function public.transition_match_clock(
  p_match_id uuid,
  p_command text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  elapsed bigint;
  before_state jsonb;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.session_id and idempotency_key = p_idempotency_key) then return to_jsonb(target) || jsonb_build_object('server_now', clock_timestamp(), 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  before_state := to_jsonb(target);
  elapsed := private.current_match_elapsed(target);

  if p_command = 'start' and target.state = 'ready' then
    update public.matches set state = 'live', clock_phase = 'regulation', started_at_server = clock_timestamp(), started_at = coalesce(started_at, clock_timestamp()), paused_at = null, revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'pause' and target.state in ('live', 'overtime_live') then
    update public.matches set state = case when target.state = 'live' then 'paused'::public.match_state else 'overtime_paused'::public.match_state end,
      elapsed_ms_before_start = elapsed, started_at_server = null, paused_at = clock_timestamp(), revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'resume' and target.state in ('paused', 'overtime_paused') then
    update public.matches set state = case when target.state = 'paused' then 'live'::public.match_state else 'overtime_live'::public.match_state end,
      started_at_server = clock_timestamp(), paused_at = null, revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'reset' and target.state not in ('completed', 'cancelled') then
    update public.matches set state = 'ready', clock_phase = 'regulation', started_at_server = null, elapsed_ms_before_start = 0, paused_at = null,
      duration_limit_ms = regulation_duration_ms, started_at = null, revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'finish_regulation' and target.state in ('live', 'paused') then
    update public.matches set state = 'regulation_ended', elapsed_ms_before_start = elapsed, started_at_server = null, paused_at = null, revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'start_overtime' and target.state = 'regulation_ended' then
    update public.matches set state = 'overtime_live', clock_phase = 'overtime', started_at_server = clock_timestamp(), elapsed_ms_before_start = 0, paused_at = null,
      duration_limit_ms = overtime_duration_ms, revision = revision + 1, updated_at = now() where id = target.id;
  elsif p_command = 'finish_overtime' and target.state in ('overtime_live', 'overtime_paused') then
    update public.matches set state = 'tie_break', elapsed_ms_before_start = elapsed, started_at_server = null, paused_at = null, revision = revision + 1, updated_at = now() where id = target.id;
  else
    raise exception 'Invalid clock transition from % with %', target.state, p_command using errcode = '22023';
  end if;
  select * into target from public.matches where id = p_match_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'clock_' || p_command, 'match', target.id, (select auth.uid()), p_idempotency_key, before_state, to_jsonb(target));
  return to_jsonb(target) || jsonb_build_object('server_now', clock_timestamp());
end;
$$;

create function public.record_match_event(
  p_match_id uuid,
  p_event_type public.match_event_type,
  p_side public.field_side,
  p_scorer_player_id uuid,
  p_assist_player_id uuid,
  p_keeper_player_id uuid,
  p_goal_kind public.goal_kind,
  p_penalty_outcome public.penalty_outcome,
  p_label text,
  p_metadata jsonb,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  existing public.match_events%rowtype;
  created public.match_events%rowtype;
  participant uuid;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into existing from public.match_events where match_id = p_match_id and idempotency_key = p_idempotency_key;
  if existing.id is not null then return to_jsonb(existing) || jsonb_build_object('match_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if target.state in ('completed', 'cancelled', 'draft', 'ready') then raise exception 'Match is not accepting events' using errcode = '55000'; end if;
  foreach participant in array array_remove(array[p_scorer_player_id, p_assist_player_id, p_keeper_player_id], null) loop
    if not exists (select 1 from public.attendance where session_id = target.session_id and player_id = participant) then raise exception 'Participant does not belong to this session' using errcode = '23503'; end if;
  end loop;
  insert into public.match_events (match_id, session_id, org_id, event_type, side, scorer_player_id, assist_player_id, keeper_player_id, goal_kind, penalty_outcome, occurrence_ms, label, metadata, idempotency_key, created_by)
  values (target.id, target.session_id, target.org_id, p_event_type, p_side, p_scorer_player_id, p_assist_player_id, p_keeper_player_id, p_goal_kind, p_penalty_outcome,
    private.current_match_elapsed(target), nullif(trim(p_label), ''), coalesce(p_metadata, '{}'::jsonb), p_idempotency_key, (select auth.uid()))
  returning * into created;
  update public.matches set revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'record_' || p_event_type::text, 'match_event', created.id, (select auth.uid()), p_idempotency_key, to_jsonb(created));
  return to_jsonb(created) || jsonb_build_object('match_revision', target.revision + 1);
end;
$$;

create function public.void_match_event(
  p_event_id uuid,
  p_reason text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.match_events%rowtype;
  target_match public.matches%rowtype;
begin
  if char_length(trim(p_reason)) < 3 then raise exception 'Reason is required' using errcode = '22023'; end if;
  select * into target_event from public.match_events where id = p_event_id for update;
  if target_event.id is null then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select * into target_match from public.matches where id = target_event.match_id for update;
  if not private.can_manage_ranka(target_match.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target_match.session_id and idempotency_key = p_idempotency_key) then return to_jsonb(target_event) || jsonb_build_object('match_revision', target_match.revision, 'idempotent', true); end if;
  if target_match.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target_match.revision::text; end if;
  if target_event.status = 'void' then return to_jsonb(target_event) || jsonb_build_object('match_revision', target_match.revision); end if;
  update public.match_events set status = 'void', voided_by = (select auth.uid()), voided_at = now(), void_reason = trim(p_reason), version = version + 1 where id = target_event.id returning * into target_event;
  update public.matches set revision = revision + 1, updated_at = now() where id = target_match.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target_match.org_id, target_match.ranka_id, target_match.session_id, target_match.id, 'void_event', 'match_event', target_event.id, (select auth.uid()), p_idempotency_key, to_jsonb(target_event), trim(p_reason));
  return to_jsonb(target_event) || jsonb_build_object('match_revision', target_match.revision + 1);
end;
$$;

create function public.resolve_match_tie(
  p_match_id uuid,
  p_method text,
  p_winner_squad_id uuid,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.matches%rowtype;
  waiting_full_squads integer;
  configured_squad_size integer;
begin
  if p_method not in ('penalties', 'odd_even', 'both_out', 'manual') then raise exception 'Invalid tie method' using errcode = '22023'; end if;
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.match_events where match_id = target.id and idempotency_key = p_idempotency_key) then return to_jsonb(target) || jsonb_build_object('idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if p_method <> 'both_out' and (p_winner_squad_id is null or p_winner_squad_id not in (target.yellow_squad_id, target.red_squad_id)) then raise exception 'Winner must be one of the field squads' using errcode = '23514'; end if;
  if p_method = 'both_out' then
    configured_squad_size := coalesce((target.rule_snapshot ->> 'squadSize')::integer, 6);
    select count(*) into waiting_full_squads
    from public.squads s
    where s.session_id = target.session_id
      and s.id not in (target.yellow_squad_id, target.red_squad_id)
      and (select count(*) from public.squad_members sm where sm.squad_id = s.id and sm.removed_at is null) >= configured_squad_size;
    if waiting_full_squads < 2 then raise exception 'Two complete waiting squads are required for both_out' using errcode = '23514'; end if;
  end if;
  insert into public.match_events (match_id, session_id, org_id, event_type, occurrence_ms, metadata, idempotency_key, created_by)
  values (target.id, target.session_id, target.org_id, 'tie_resolution', private.current_match_elapsed(target), jsonb_build_object('method', p_method, 'winner_squad_id', p_winner_squad_id), p_idempotency_key, (select auth.uid()));
  update public.matches set state = 'tie_break', revision = revision + 1, updated_at = now() where id = target.id returning * into target;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'resolve_tie', 'match', target.id, (select auth.uid()), gen_random_uuid(), jsonb_build_object('method', p_method, 'winner_squad_id', p_winner_squad_id));
  return to_jsonb(target);
end;
$$;

create function public.complete_match_and_rotate(
  p_match_id uuid,
  p_result_override text,
  p_reason text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.matches%rowtype;
  target_session public.sessions%rowtype;
  yellow_score integer;
  red_score integer;
  result_value text;
  tie_winner uuid;
  outgoing_one uuid;
  outgoing_two uuid;
  incoming_yellow uuid;
  incoming_red uuid;
  next_match public.matches%rowtype;
  next_ordinal integer;
  max_queue integer;
begin
  select * into target from public.matches where id = p_match_id for update;
  if target.id is null then raise exception 'Match not found' using errcode = 'P0002'; end if;
  select * into target_session from public.sessions where id = target.session_id for update;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = target.session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('match_id', target.id, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  select
    count(*) filter (where side = 'yellow' and (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted'))),
    count(*) filter (where side = 'red' and (event_type = 'goal' or (event_type = 'penalty_attempt' and penalty_outcome = 'converted')))
  into yellow_score, red_score from public.match_events where match_id = target.id and status = 'active';
  select nullif(metadata ->> 'winner_squad_id', '')::uuid into tie_winner from public.match_events where match_id = target.id and event_type = 'tie_resolution' and status = 'active' order by created_at desc limit 1;

  if p_result_override is not null then
    if p_result_override not in ('yellow', 'red', 'both_out') or char_length(trim(p_reason)) < 3 then raise exception 'Override requires a valid result and reason' using errcode = '22023'; end if;
    result_value := p_result_override;
  elsif yellow_score > red_score then result_value := 'yellow';
  elsif red_score > yellow_score then result_value := 'red';
  elsif tie_winner = target.yellow_squad_id then result_value := 'yellow';
  elsif tie_winner = target.red_squad_id then result_value := 'red';
  elsif exists (select 1 from public.match_events where match_id = target.id and event_type = 'tie_resolution' and metadata ->> 'method' = 'both_out' and status = 'active') then result_value := 'both_out';
  else raise exception 'Tie must be resolved before rotation' using errcode = '55000';
  end if;

  select coalesce(max(queue_position), 0) into max_queue from public.squads where session_id = target.session_id;
  if result_value = 'yellow' then
    outgoing_one := target.red_squad_id;
    incoming_yellow := target.yellow_squad_id;
    select id into incoming_red from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
  elsif result_value = 'red' then
    outgoing_one := target.yellow_squad_id;
    incoming_red := target.red_squad_id;
    select id into incoming_yellow from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
  else
    outgoing_one := target.yellow_squad_id; outgoing_two := target.red_squad_id;
    select id into incoming_yellow from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id) order by queue_position limit 1;
    select id into incoming_red from public.squads where session_id = target.session_id and state = 'waiting' and id not in (target.yellow_squad_id, target.red_squad_id, incoming_yellow) order by queue_position limit 1;
  end if;
  update public.squads set state = 'resting', queue_position = max_queue + 1, updated_at = now() where id = outgoing_one;
  if outgoing_two is not null then update public.squads set state = 'resting', queue_position = max_queue + 2, updated_at = now() where id = outgoing_two; end if;
  update public.squads set state = 'field', updated_at = now() where id in (incoming_yellow, incoming_red);
  update public.matches set state = 'completed', ended_at = clock_timestamp(), started_at_server = null, revision = revision + 1, updated_at = now() where id = target.id;

  if incoming_yellow is not null and incoming_red is not null then
    next_ordinal := target.ordinal + 1;
    insert into public.matches (session_id, ranka_id, org_id, ordinal, yellow_squad_id, red_squad_id, state, regulation_duration_ms, overtime_duration_ms, duration_limit_ms, rule_snapshot)
    values (target.session_id, target.ranka_id, target.org_id, next_ordinal, incoming_yellow, incoming_red, 'ready', target.regulation_duration_ms, target.overtime_duration_ms, target.regulation_duration_ms, target.rule_snapshot)
    returning * into next_match;
    insert into public.match_assignments (match_id, session_id, org_id, player_id, squad_id, field_side, role, created_by)
    select next_match.id, target.session_id, target.org_id, sm.player_id, sm.squad_id,
      case when sm.squad_id = incoming_yellow then 'yellow'::public.field_side else 'red'::public.field_side end, 'line', (select auth.uid())
    from public.squad_members sm where sm.squad_id in (incoming_yellow, incoming_red) and sm.removed_at is null;
  end if;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, match_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data, reason)
  values (target.org_id, target.ranka_id, target.session_id, target.id, 'complete_and_rotate', 'match', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('result', result_value, 'next_match_id', next_match.id, 'yellow_score', yellow_score, 'red_score', red_score), nullif(trim(p_reason), ''));
  return jsonb_build_object('completed_match_id', target.id, 'next_match_id', next_match.id, 'result', result_value, 'session_revision', target_session.revision + 1);
end;
$$;

create function public.batch_mark_contributions(
  p_session_id uuid,
  p_player_ids uuid[],
  p_status public.contribution_status,
  p_note text,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.sessions%rowtype; affected integer;
begin
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if cardinality(coalesce(p_player_ids, '{}'::uuid[])) = 0 then raise exception 'Select at least one player' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_player_ids) selected where not exists (select 1 from public.attendance a where a.session_id = p_session_id and a.player_id = selected)) then raise exception 'Contribution player is not in this session' using errcode = '23503'; end if;
  insert into public.contribution_records (session_id, org_id, player_id, amount_cents, status, note, recorded_by)
  select target.id, target.org_id, selected, target.contribution_amount_cents, p_status, nullif(trim(p_note), ''), (select auth.uid())
  from (select distinct unnest(p_player_ids) as selected) values_to_save
  on conflict (session_id, player_id) do update set status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by, recorded_at = now(), updated_at = now();
  get diagnostics affected = row_count;
  update public.sessions set revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'batch_contributions', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('status', p_status, 'player_ids', p_player_ids, 'amount_cents_snapshot', target.contribution_amount_cents, 'affected', affected));
  return jsonb_build_object('session_revision', target.revision + 1, 'affected', affected);
end;
$$;

create function public.update_session_rules(
  p_session_id uuid,
  p_rules jsonb,
  p_contribution_amount_cents integer,
  p_expected_revision bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.sessions%rowtype;
begin
  if jsonb_typeof(p_rules) <> 'object' or p_contribution_amount_cents < 0 then raise exception 'Invalid rules' using errcode = '22023'; end if;
  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then return jsonb_build_object('session_revision', target.revision, 'idempotent', true); end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  update public.sessions set rules_snapshot = p_rules, contribution_amount_cents = p_contribution_amount_cents, revision = revision + 1, updated_at = now() where id = target.id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, before_data, after_data)
  values (target.org_id, target.ranka_id, target.id, 'update_rules', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('rules', target.rules_snapshot, 'contribution_amount_cents', target.contribution_amount_cents),
    jsonb_build_object('rules', p_rules, 'contribution_amount_cents', p_contribution_amount_cents));
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_assignments enable row level security;
alter table public.match_events enable row level security;
alter table public.substitutions enable row level security;
alter table public.contribution_records enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.squads, public.squad_members, public.matches, public.match_assignments, public.match_events, public.substitutions, public.contribution_records, public.audit_logs from anon, authenticated;
grant select on public.squads, public.squad_members, public.matches, public.match_assignments, public.match_events, public.substitutions, public.contribution_records, public.audit_logs to authenticated;

create policy squads_select on public.squads for select to authenticated using (private.is_org_member(org_id));
create policy squad_members_select on public.squad_members for select to authenticated using (private.is_org_member(org_id));
create policy matches_select on public.matches for select to authenticated using (private.is_org_member(org_id));
create policy match_assignments_select on public.match_assignments for select to authenticated using (private.is_org_member(org_id));
create policy match_events_select on public.match_events for select to authenticated using (private.is_org_member(org_id));
create policy substitutions_select on public.substitutions for select to authenticated using (private.is_org_member(org_id));
create policy contribution_records_select on public.contribution_records for select to authenticated using (private.is_org_member(org_id));
create policy audit_logs_select on public.audit_logs for select to authenticated using (private.is_org_member(org_id));

revoke all on function public.generate_session_squads(uuid, integer, text, integer, bigint, uuid) from public, anon;
revoke all on function public.create_player_with_aliases_confirmed(uuid, text, text, public.player_role_preference, text[], boolean) from public, anon;
revoke all on function public.set_attendance_status(uuid, uuid, public.attendance_status, text, bigint, uuid) from public, anon;
revoke all on function public.substitute_squad_member(uuid, uuid, uuid, uuid, text, boolean, bigint, uuid) from public, anon;
revoke all on function public.prepare_next_match(uuid, bigint, uuid) from public, anon;
revoke all on function public.confirm_match_officials(uuid, uuid, uuid, uuid[], bigint, uuid) from public, anon;
revoke all on function public.transition_match_clock(uuid, text, bigint, uuid) from public, anon;
revoke all on function public.record_match_event(uuid, public.match_event_type, public.field_side, uuid, uuid, uuid, public.goal_kind, public.penalty_outcome, text, jsonb, bigint, uuid) from public, anon;
revoke all on function public.void_match_event(uuid, text, bigint, uuid) from public, anon;
revoke all on function public.resolve_match_tie(uuid, text, uuid, bigint, uuid) from public, anon;
revoke all on function public.complete_match_and_rotate(uuid, text, text, bigint, uuid) from public, anon;
revoke all on function public.batch_mark_contributions(uuid, uuid[], public.contribution_status, text, bigint, uuid) from public, anon;
revoke all on function public.update_session_rules(uuid, jsonb, integer, bigint, uuid) from public, anon;

grant execute on function public.generate_session_squads(uuid, integer, text, integer, bigint, uuid) to authenticated;
grant execute on function public.create_player_with_aliases_confirmed(uuid, text, text, public.player_role_preference, text[], boolean) to authenticated;
grant execute on function public.set_attendance_status(uuid, uuid, public.attendance_status, text, bigint, uuid) to authenticated;
grant execute on function public.substitute_squad_member(uuid, uuid, uuid, uuid, text, boolean, bigint, uuid) to authenticated;
grant execute on function public.prepare_next_match(uuid, bigint, uuid) to authenticated;
grant execute on function public.confirm_match_officials(uuid, uuid, uuid, uuid[], bigint, uuid) to authenticated;
grant execute on function public.transition_match_clock(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.record_match_event(uuid, public.match_event_type, public.field_side, uuid, uuid, uuid, public.goal_kind, public.penalty_outcome, text, jsonb, bigint, uuid) to authenticated;
grant execute on function public.void_match_event(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.resolve_match_tie(uuid, text, uuid, bigint, uuid) to authenticated;
grant execute on function public.complete_match_and_rotate(uuid, text, text, bigint, uuid) to authenticated;
grant execute on function public.batch_mark_contributions(uuid, uuid[], public.contribution_status, text, bigint, uuid) to authenticated;
grant execute on function public.update_session_rules(uuid, jsonb, integer, bigint, uuid) to authenticated;

create trigger broadcast_attendance_changes after insert or update or delete on public.attendance for each row execute function private.broadcast_session_change();
create trigger broadcast_session_changes after update on public.sessions for each row execute function private.broadcast_session_change();
create trigger broadcast_squad_changes after insert or update or delete on public.squads for each row execute function private.broadcast_session_change();
create trigger broadcast_squad_member_changes after insert or update or delete on public.squad_members for each row execute function private.broadcast_session_change();
create trigger broadcast_match_changes after insert or update or delete on public.matches for each row execute function private.broadcast_session_change();
create trigger broadcast_match_assignment_changes after insert or update or delete on public.match_assignments for each row execute function private.broadcast_session_change();
create trigger broadcast_match_event_changes after insert or update or delete on public.match_events for each row execute function private.broadcast_session_change();
create trigger broadcast_substitution_changes after insert or update or delete on public.substitutions for each row execute function private.broadcast_session_change();
create trigger broadcast_contribution_changes after insert or update or delete on public.contribution_records for each row execute function private.broadcast_session_change();

commit;
