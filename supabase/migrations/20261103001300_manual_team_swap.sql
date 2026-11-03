create function public.swap_squad_players(
  p_session_id uuid,
  p_first_squad_id uuid,
  p_first_player_id uuid,
  p_second_squad_id uuid,
  p_second_player_id uuid,
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
  first_member public.squad_members%rowtype;
  second_member public.squad_members%rowtype;
begin
  if p_first_squad_id = p_second_squad_id or p_first_player_id = p_second_player_id then
    raise exception 'Players must belong to different squads' using errcode = '22023';
  end if;

  select * into target from public.sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.audit_logs where session_id = p_session_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('session_revision', target.revision, 'idempotent', true);
  end if;
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = '40001', detail = target.revision::text; end if;
  if exists (
    select 1 from public.matches
    where session_id = p_session_id and state not in ('completed', 'cancelled')
  ) then
    raise exception 'Teams cannot be edited after pre-game starts' using errcode = '55000';
  end if;

  select * into first_member from public.squad_members
  where session_id = p_session_id and squad_id = p_first_squad_id and player_id = p_first_player_id and removed_at is null
  for update;
  select * into second_member from public.squad_members
  where session_id = p_session_id and squad_id = p_second_squad_id and player_id = p_second_player_id and removed_at is null
  for update;
  if first_member.id is null or second_member.id is null then
    raise exception 'Active squad member not found' using errcode = 'P0002';
  end if;

  update public.squad_members
  set squad_id = case id when first_member.id then second_member.squad_id else first_member.squad_id end,
      assignment_order = case id when first_member.id then second_member.assignment_order else first_member.assignment_order end,
      assignment_reason = 'manual_swap'
  where id in (first_member.id, second_member.id);

  update public.sessions set revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (
    target.org_id, target.ranka_id, target.id, 'swap_squad_players', 'session', target.id,
    (select auth.uid()), p_idempotency_key,
    jsonb_build_object(
      'first_squad_id', p_first_squad_id, 'first_player_id', p_first_player_id,
      'second_squad_id', p_second_squad_id, 'second_player_id', p_second_player_id
    )
  );
  return jsonb_build_object('session_revision', target.revision + 1);
end;
$$;

revoke all on function public.swap_squad_players(uuid, uuid, uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.swap_squad_players(uuid, uuid, uuid, uuid, uuid, bigint, uuid) to authenticated;
