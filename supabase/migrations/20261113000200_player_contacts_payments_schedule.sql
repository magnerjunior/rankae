begin;

create table public.player_contacts (
  player_id uuid primary key references public.players(id) on delete cascade,
  phone text not null check (phone ~ '^[+]?[0-9]{8,15}$')
);
alter table public.player_contacts enable row level security;
revoke all on public.player_contacts from public, anon, authenticated;

create function private.purge_hidden_player_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.player_contacts where player_id = new.id;
  return new;
end;
$$;
revoke all on function private.purge_hidden_player_contact() from public, anon, authenticated;
create trigger purge_hidden_player_contact after update of status on public.players
for each row when (new.status = 'hidden' and old.status is distinct from new.status)
execute function private.purge_hidden_player_contact();

create table private.workspace_command_receipts (
  scope_id uuid not null,
  command text not null,
  idempotency_key uuid not null,
  primary key (scope_id, command, idempotency_key)
);
revoke all on private.workspace_command_receipts from public, anon, authenticated;

create function public.create_player_profile(
  p_org_id uuid, p_full_name text, p_nickname text, p_phone text,
  p_confirm_possible_duplicate boolean, p_idempotency_key uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare player_id uuid;
begin
  if not private.can_manage_org(p_org_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is null or (p_phone is not null and p_phone !~ '^[+]?[0-9]{8,15}$') then
    raise exception 'Invalid player data' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 314));
  insert into private.workspace_command_receipts values (p_org_id, 'create_player_profile', p_idempotency_key) on conflict do nothing;
  if not found then return; end if;
  player_id := (public.create_player_with_aliases_confirmed(p_org_id, p_full_name, p_nickname, 'line', '{}'::text[], p_confirm_possible_duplicate)->>'id')::uuid;
  if p_phone is not null then insert into public.player_contacts values (player_id, p_phone); end if;
end;
$$;
revoke all on function public.create_player_profile(uuid,text,text,text,boolean,uuid) from public, anon;
grant execute on function public.create_player_profile(uuid,text,text,text,boolean,uuid) to authenticated;

create function public.get_ranka_pending_contributions(p_ranka_id uuid)
returns table (player_id uuid, session_id uuid, scheduled_on date, session_number integer, amount_cents integer, revision bigint)
language plpgsql security definer stable set search_path = '' as $$
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select c.player_id, s.id, s.scheduled_on, s.session_number, c.amount_cents, s.revision
  from public.contribution_records c join public.sessions s on s.id = c.session_id
  where s.ranka_id = p_ranka_id and c.status = 'pending' and c.amount_cents > 0
  order by s.scheduled_on desc, s.session_number desc;
end;
$$;
revoke all on function public.get_ranka_pending_contributions(uuid) from public, anon;
grant execute on function public.get_ranka_pending_contributions(uuid) to authenticated;

create function public.pay_ranka_pending_contribution(
  p_ranka_id uuid, p_session_id uuid, p_player_id uuid, p_expected_revision bigint, p_idempotency_key uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.sessions where id = p_session_id and ranka_id = p_ranka_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.contribution_records where session_id = p_session_id and player_id = p_player_id and status = 'pending' and amount_cents > 0) then return; end if;
  perform public.batch_mark_contributions(p_session_id, array[p_player_id], 'paid', null, p_expected_revision, p_idempotency_key);
end;
$$;
revoke all on function public.pay_ranka_pending_contribution(uuid,uuid,uuid,bigint,uuid) from public, anon;
grant execute on function public.pay_ranka_pending_contribution(uuid,uuid,uuid,bigint,uuid) to authenticated;

create function public.update_ranka_schedule(
  p_ranka_id uuid, p_expected_revision bigint, p_idempotency_key uuid, p_mode text,
  p_date date, p_weekdays integer[], p_alternate_day integer
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.rankas%rowtype; schedule jsonb;
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is null or p_mode is null or p_mode not in ('unset','date','weekly','alternating')
    or (p_mode in ('date','alternating') and p_date is null)
    or (p_mode = 'weekly' and (coalesce(cardinality(p_weekdays),0) not between 1 and 7 or exists (select from unnest(p_weekdays) d where d is null or d not between 0 and 6)))
    or (p_mode = 'alternating' and (p_alternate_day is null or p_alternate_day not between 0 and 6)) then
    raise exception 'Invalid schedule' using errcode = '22023';
  end if;
  select * into target from public.rankas where id = p_ranka_id for update;
  insert into private.workspace_command_receipts values (target.id, 'update_ranka_schedule', p_idempotency_key) on conflict do nothing;
  if not found then return; end if;
  if target.revision is distinct from p_expected_revision then raise exception 'Revision conflict' using errcode = 'PT409'; end if;
  schedule := case p_mode
    when 'date' then jsonb_build_object('mode', p_mode, 'date', p_date)
    when 'weekly' then jsonb_build_object('mode', p_mode, 'weekdays', p_weekdays)
    when 'alternating' then jsonb_build_object('mode', p_mode, 'date', p_date, 'alternateDay', p_alternate_day)
    else '{"mode":"unset"}'::jsonb end;
  update public.rankas set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{schedule}', schedule),
    revision = revision + 1, updated_at = now() where id = target.id;
end;
$$;
revoke all on function public.update_ranka_schedule(uuid,bigint,uuid,text,date,integer[],integer) from public, anon;
grant execute on function public.update_ranka_schedule(uuid,bigint,uuid,text,date,integer[],integer) to authenticated;

commit;
