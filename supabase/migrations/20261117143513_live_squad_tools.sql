begin;

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
  if target.revision <> p_expected_revision then raise exception 'Revision conflict' using errcode = 'PT409', detail = target.revision::text; end if;
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
  from squad_numbers order by squad_numbers.squad_number;

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

create function private.place_waiting_arrival(p_arrival public.attendance, p_squad uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  destination uuid;
  existing uuid;
  size_limit integer;
  next_number integer;
  next_position integer;
begin
  if p_arrival.status <> 'present' or p_arrival.role_preference = 'keeper' then return; end if;
  select * into target from public.sessions where id = p_arrival.session_id for update;
  if target.state = 'completed' then return; end if;
  select squad_id into existing from public.squad_members
  where session_id = target.id and player_id = p_arrival.player_id and removed_at is null;
  if existing is not null then
    if p_squad is not null and existing <> p_squad then raise exception 'Player already has a team' using errcode = 'PT409'; end if;
    return;
  end if;
  if p_squad is null and not exists(select 1 from public.squads where session_id = target.id) then return; end if;
  size_limit := coalesce((target.rules_snapshot->>'squadSize')::integer, 6);
  select s.id into destination from public.squads s where s.session_id = target.id and s.state = 'waiting'
    and (p_squad is null or s.id = p_squad)
    and (select count(*) from public.squad_members sm where sm.squad_id=s.id and sm.removed_at is null) < size_limit
    order by s.queue_position limit 1 for update;
  if destination is null and p_squad is not null then raise exception 'Team is full or playing' using errcode = 'PT409'; end if;
  if destination is null then
    select coalesce(max(squad_number),0)+1, coalesce(max(queue_position),0)+1 into next_number,next_position
      from public.squads where session_id=target.id;
    insert into public.squads (session_id,ranka_id,org_id,squad_number,queue_position,formation_method)
    values (target.id,target.ranka_id,target.org_id,next_number,next_position,'sequential') returning id into destination;
  end if;
  insert into public.squad_members (squad_id,session_id,org_id,player_id,assignment_order,assignment_reason,assigned_by)
  select destination,target.id,target.org_id,p_arrival.player_id,coalesce(max(assignment_order),0)+1,'late_arrival',coalesce((select auth.uid()),p_arrival.created_by)
  from public.squad_members where squad_id=destination and removed_at is null;
end;
$$;
revoke all on function private.place_waiting_arrival(public.attendance,uuid) from public,anon,authenticated;

create function private.auto_place_waiting_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = new.status and old.role_preference = new.role_preference then return new; end if;
  perform private.place_waiting_arrival(new, nullif(current_setting('rankae.preferred_squad',true),'')::uuid);
  return new;
end;
$$;
revoke all on function private.auto_place_waiting_arrival() from public,anon,authenticated;
create trigger waiting_team_on_arrival after insert or update of status,role_preference on public.attendance
for each row execute function private.auto_place_waiting_arrival();

create function public.add_direct_team_arrival(p_session uuid,p_squad uuid,p_name text,p_revision bigint,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; arrival public.attendance%rowtype;
begin
  if not exists(select 1 from public.squads where id=p_squad and session_id=p_session and state='waiting')
    then raise exception 'Choose a waiting team' using errcode='PT409'; end if;
  perform set_config('rankae.preferred_squad',p_squad::text,true);
  result := public.bulk_add_arrivals(p_session,jsonb_build_array(jsonb_build_object('fullName',p_name,'role','line')),p_revision,p_key);
  perform set_config('rankae.preferred_squad','',true);
  select * into arrival from public.attendance where id=(result->'arrivals'->0->>'id')::uuid;
  if found then perform private.place_waiting_arrival(arrival,p_squad); end if;
  return result;
end;
$$;
revoke all on function public.add_direct_team_arrival(uuid,uuid,text,bigint,uuid) from public,anon;
grant execute on function public.add_direct_team_arrival(uuid,uuid,text,bigint,uuid) to authenticated;

create function private.shuffle_waiting_squads(p_session uuid,p_squads uuid[],p_seed integer) returns void
language plpgsql set search_path = '' as $$
begin
  if coalesce(cardinality(p_squads),0) < 2 then return; end if;
  with removed as (
    update public.squad_members set removed_at=now(), removed_reason='Novo sorteio'
    where session_id=p_session and squad_id=any(p_squads) and removed_at is null
    returning session_id,org_id,squad_id,player_id,assignment_order,assigned_by,id
  ), slots as (
    select r.*,row_number() over(order by squad_id,assignment_order,id) as position from removed r
  ), shuffled as (
    select r.player_id,row_number() over(order by md5(p_seed::text || r.player_id::text),r.id) as position from removed r
  )
  insert into public.squad_members(squad_id,session_id,org_id,player_id,assignment_order,assignment_reason,assigned_by)
  select s.squad_id,s.session_id,s.org_id,p.player_id,s.assignment_order,'selective_shuffle',coalesce((select auth.uid()),s.assigned_by)
  from slots s join shuffled p using(position);
end;
$$;
revoke all on function private.shuffle_waiting_squads(uuid,uuid[],integer) from public,anon,authenticated;

create function public.redraw_waiting_squads(p_session uuid,p_squads uuid[],p_seed integer,p_revision bigint,p_key uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id=p_session for update;
  if not found or not private.can_manage_ranka(target.ranka_id) then raise exception 'Forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.audit_logs where session_id=p_session and idempotency_key=p_key) then return; end if;
  if target.revision is distinct from p_revision or target.state='completed' then raise exception 'Session changed' using errcode='PT409'; end if;
  if coalesce(cardinality(p_squads),0)<2 or
    (select count(*) from public.squads where session_id=p_session and id=any(p_squads) and state='waiting') <> cardinality(p_squads)
    then raise exception 'Choose at least two waiting teams' using errcode='22023'; end if;
  perform private.shuffle_waiting_squads(p_session,p_squads,p_seed);
  update public.sessions set revision=revision+1,updated_at=now() where id=p_session;
  insert into public.audit_logs(org_id,ranka_id,session_id,action,entity_type,entity_id,actor_id,idempotency_key,after_data)
  values(target.org_id,target.ranka_id,p_session,'redraw_waiting_squads','session',p_session,(select auth.uid()),p_key,jsonb_build_object('squads',p_squads));
end;
$$;
revoke all on function public.redraw_waiting_squads(uuid,uuid[],integer,bigint,uuid) from public,anon;
grant execute on function public.redraw_waiting_squads(uuid,uuid[],integer,bigint,uuid) to authenticated;

create function public.generate_squads_extended(p_session uuid,p_size integer,p_mode text,p_seed integer,p_revision bigint,p_key uuid,p_players uuid[],p_yellow integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; batch uuid[];
begin
  result := public.generate_initial_squads(p_session,p_size,
    case p_mode when 'all' then 'sequential' when 'pairs' then 'shuffle_blocks' else p_mode end,
    p_seed,p_revision,p_key,p_players,p_yellow);
  if coalesce((result->>'idempotent')::boolean,false) then return result; end if;
  if p_mode='all' then
    select array_agg(id) into batch from public.squads where session_id=p_session;
    perform private.shuffle_waiting_squads(p_session,batch,p_seed);
  elsif p_mode='pairs' then
    for batch in select array_agg(id) from public.squads where session_id=p_session and squad_number>2
      group by (squad_number-1)/2
    loop
      perform private.shuffle_waiting_squads(p_session,batch,p_seed);
    end loop;
  end if;
  return result;
end;
$$;
revoke all on function public.generate_squads_extended(uuid,integer,text,integer,bigint,uuid,uuid[],integer) from public,anon;
grant execute on function public.generate_squads_extended(uuid,integer,text,integer,bigint,uuid,uuid[],integer) to authenticated;

commit;
