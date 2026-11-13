create or replace function public.generate_initial_squads(
  p_session_id uuid,
  p_squad_size integer,
  p_method text,
  p_seed integer,
  p_expected_revision bigint,
  p_idempotency_key uuid,
  p_manual_players uuid[],
  p_yellow_number integer
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
  if p_squad_size is null or p_method is null or p_expected_revision is null or p_idempotency_key is null or p_squad_size not between 2 and 12 or p_method not in ('sequential', 'shuffle_blocks', 'manual') then
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

  if p_yellow_number is null or p_yellow_number not in (1, 2) then raise exception 'Invalid side' using errcode = '22023'; end if;
  if p_method = 'manual' then
    if cardinality(p_manual_players) is distinct from p_squad_size * 2
      or (select count(distinct id) from unnest(p_manual_players) id) <> p_squad_size * 2
      or exists (select 1 from unnest(p_manual_players) as chosen(player_id) where not exists (
        select 1 from public.attendance a where a.session_id = p_session_id and a.player_id = chosen.player_id and a.status = 'present' and a.role_preference <> 'keeper'
      )) then raise exception 'Select two complete eligible squads without duplicates' using errcode = '22023'; end if;
  end if;
  delete from public.squads where session_id = p_session_id;

  with eligible as (
    select a.player_id, row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*, row_number() over (order by
      case when p_method = 'manual' then coalesce(array_position(p_manual_players, e.player_id), 1000) when e.arrival_order <= p_squad_size * 2 then 0 else 1 end,
      case
        when p_method = 'shuffle_blocks' and e.arrival_order <= p_squad_size * 2
          then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text)
        else lpad(e.arrival_order::text, 12, '0')
      end
    ) as formation_order
    from eligible e
  ), squad_numbers as (
    select distinct (floor((formation_order - 1)::numeric / p_squad_size)::integer + 1) as squad_number
    from ordered
  )
  insert into public.squads (session_id, ranka_id, org_id, squad_number, queue_position, formation_method, shuffle_seed)
  select p_session_id, target.ranka_id, target.org_id, squad_number, case when p_yellow_number = 2 and squad_number <= 2 then 3 - squad_number else squad_number end, p_method,
    case when p_method = 'shuffle_blocks' then coalesce(p_seed, 1) end
  from squad_numbers order by squad_number;

  with eligible as (
    select a.player_id, row_number() over (order by a.arrival_index, a.id) as arrival_order
    from public.attendance a
    where a.session_id = p_session_id and a.status = 'present' and a.role_preference <> 'keeper'
  ), ordered as (
    select e.*, row_number() over (order by
      case when p_method = 'manual' then coalesce(array_position(p_manual_players, e.player_id), 1000) when e.arrival_order <= p_squad_size * 2 then 0 else 1 end,
      case
        when p_method = 'shuffle_blocks' and e.arrival_order <= p_squad_size * 2
          then md5(coalesce(p_seed, 1)::text || ':' || e.arrival_order::text)
        else lpad(e.arrival_order::text, 12, '0')
      end
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
  update public.sessions set rules_snapshot = jsonb_set(rules_snapshot, '{squadSize}', to_jsonb(p_squad_size)), state = 'team_formation', revision = revision + 1, updated_at = now() where id = p_session_id;
  insert into public.audit_logs (org_id, ranka_id, session_id, action, entity_type, entity_id, actor_id, idempotency_key, after_data)
  values (target.org_id, target.ranka_id, target.id, 'generate_squads', 'session', target.id, (select auth.uid()), p_idempotency_key,
    jsonb_build_object('squad_size', p_squad_size, 'method', p_method, 'seed', p_seed, 'squad_count', created_count, 'yellow_number', p_yellow_number, 'manual_players', p_manual_players, 'shuffle_scope', 'first_two_only'));
  return jsonb_build_object('session_revision', target.revision + 1, 'squad_count', created_count);
end;
$$;

revoke all on function public.generate_initial_squads(uuid, integer, text, integer, bigint, uuid, uuid[], integer) from public, anon;
grant execute on function public.generate_initial_squads(uuid, integer, text, integer, bigint, uuid, uuid[], integer) to authenticated;
