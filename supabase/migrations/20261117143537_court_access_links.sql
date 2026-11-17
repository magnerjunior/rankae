begin;

create table private.court_links(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  pin_hash text not null,
  expires_at timestamptz not null default now()+interval '24 hours',
  revoked_at timestamptz,
  failures integer not null default 0,
  blocked_until timestamptz
);
create unique index court_one_open_link on private.court_links(session_id) where revoked_at is null;
alter table private.court_links enable row level security;
create table private.court_device_access(
  link_id uuid not null references private.court_links(id) on delete cascade,
  token_hash bytea not null,
  primary key(link_id,token_hash)
);
alter table private.court_device_access enable row level security;
revoke all on private.court_links,private.court_device_access from public,anon,authenticated;

create function public.configure_court_access(p_session uuid,p_pin text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.sessions%rowtype; actor uuid:=(select auth.uid()); link uuid;
begin
  select s.* into target from public.sessions s join public.organizations o on o.id=s.org_id
    where s.id=p_session and o.owner_user_id=actor and s.state<>'completed' for update of s;
  if not found then raise exception 'Only the owner can share an open day' using errcode='42501'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'Invalid PIN' using errcode='22023'; end if;
  update private.court_links set revoked_at=now() where session_id=p_session and revoked_at is null;
  if p_pin is null then return null; end if;
  insert into private.court_links(session_id,owner_id,pin_hash)
    values(p_session,actor,extensions.crypt(p_pin,extensions.gen_salt('bf',10))) returning id into link;
  return link;
end;
$$;
revoke all on function public.configure_court_access(uuid,text) from public,anon;
grant execute on function public.configure_court_access(uuid,text) to authenticated;

create function public.unlock_court_access(p_link uuid,p_pin text,p_device_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare link private.court_links%rowtype;
begin
  if coalesce(p_pin,'') !~ '^[0-9]{4}$' or coalesce(p_device_token,'') !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  select l.* into link from private.court_links l join public.sessions s on s.id=l.session_id
    where l.id=p_link and l.revoked_at is null and l.expires_at>now() and s.state<>'completed' for update of l;
  if not found or link.blocked_until>now() then return false; end if;
  if extensions.crypt(p_pin,link.pin_hash)<>link.pin_hash then
    update private.court_links set
      failures=case when link.blocked_until is not null then 1 else link.failures+1 end,
      blocked_until=case when link.blocked_until is null and link.failures>=4 then now()+interval '10 minutes' end
    where id=link.id;
    return false;
  end if;
  update private.court_links set failures=0,blocked_until=null where id=link.id;
  insert into private.court_device_access values(link.id,extensions.digest(p_device_token,'sha256')) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.unlock_court_access(uuid,text,text) from public;
grant execute on function public.unlock_court_access(uuid,text,text) to anon,authenticated;

create function private.valid_court_link(p_link uuid,p_device_token text) returns private.court_links
language sql stable set search_path='' as $$
  select l.* from private.court_links l join private.court_device_access d on d.link_id=l.id
  join public.sessions s on s.id=l.session_id join public.organizations o on o.id=s.org_id and o.owner_user_id=l.owner_id
  where l.id=p_link and d.token_hash=extensions.digest(p_device_token,'sha256') and l.revoked_at is null and l.expires_at>now() and s.state<>'completed'
$$;
revoke all on function private.valid_court_link(uuid,text) from public,anon,authenticated;

create function public.get_court_day(p_link uuid,p_device_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare link private.court_links; current_match public.matches;
begin
  link:=private.valid_court_link(p_link,p_device_token);
  if link.id is null then return null; end if;
  select * into current_match from public.matches where session_id=link.session_id and state<>'cancelled' order by ordinal desc limit 1;
  return (select jsonb_build_object(
    'name',r.name,'revision',s.revision,'size',coalesce((s.rules_snapshot->>'squadSize')::integer,6),
    'arrivals',coalesce((select jsonb_agg(jsonb_build_object('id',a.player_id,'name',p.full_name,'order',a.arrival_index,'role',a.role_preference) order by a.arrival_index)
      from public.attendance a join public.players p on p.id=a.player_id where a.session_id=s.id and a.status='present'),'[]'::jsonb),
    'squads',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'number',q.squad_number,'state',q.state,
      'players',coalesce((select jsonb_agg(p.full_name order by sm.assignment_order) from public.squad_members sm join public.players p on p.id=sm.player_id
        where sm.squad_id=q.id and sm.removed_at is null),'[]'::jsonb)) order by q.queue_position) from public.squads q
      where q.session_id=s.id and q.state<>'archived'),'[]'::jsonb),
    'match',case when current_match.id is not null then jsonb_build_object('state',current_match.state,'revision',current_match.revision,'ordinal',current_match.ordinal,
      'startedAt',current_match.started_at_server,'elapsed',current_match.elapsed_ms_before_start,
      'duration',current_match.duration_limit_ms,'serverNow',clock_timestamp(),
      'yellow',(select count(*) from public.match_events e where e.match_id=current_match.id and e.side='yellow' and e.status='active' and (e.event_type='goal' or (e.event_type='penalty_attempt' and e.penalty_outcome='converted'))),
      'red',(select count(*) from public.match_events e where e.match_id=current_match.id and e.side='red' and e.status='active' and (e.event_type='goal' or (e.event_type='penalty_attempt' and e.penalty_outcome='converted')))) end)
    from public.sessions s join public.rankas r on r.id=s.ranka_id where s.id=link.session_id);
end;
$$;
revoke all on function public.get_court_day(uuid,text) from public;
grant execute on function public.get_court_day(uuid,text) to anon,authenticated;

create function public.court_day_command(p_link uuid,p_token text,p_command text,p_data jsonb,p_revision bigint,p_key uuid)
returns void language plpgsql security definer set search_path='' as $$
declare link private.court_links; game public.matches%rowtype;
  original_claims text:=current_setting('request.jwt.claims',true);
  original_sub text:=current_setting('request.jwt.claim.sub',true);
  size_limit integer;
begin
  link:=private.valid_court_link(p_link,p_token);
  if link.id is null or p_key is null then raise exception 'Court access expired' using errcode='42501'; end if;
  -- Only the fixed commands below run under the owner’s authorization, in the linked session.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',link.owner_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',link.owner_id::text,true);
  select * into game from public.matches where session_id=link.session_id and state<>'cancelled' order by ordinal desc limit 1;
  case p_command
    when 'arrival' then perform public.bulk_add_arrivals(link.session_id,jsonb_build_array(jsonb_build_object('fullName',p_data->>'name','role',p_data->>'role')),p_revision,p_key);
    when 'order' then perform public.reorder_session_arrival(link.session_id,(p_data->>'player')::uuid,(p_data->>'position')::integer,p_revision,p_key);
    when 'draw' then
      select coalesce((rules_snapshot->>'squadSize')::integer,6) into size_limit from public.sessions where id=link.session_id;
      perform public.generate_squads_extended(link.session_id,size_limit,p_data->>'method',(random()*2147483646)::integer,p_revision,p_key,null,1);
    when 'prepare' then
      if game.id is not null then raise exception 'Game already prepared' using errcode='PT409'; end if;
      perform public.prepare_next_match(link.session_id,p_revision,p_key);
    when 'start' then perform public.transition_match_clock(game.id,'start',p_revision,p_key);
    when 'pause' then perform public.transition_match_clock(game.id,'pause',p_revision,p_key);
    when 'resume' then perform public.transition_match_clock(game.id,'resume',p_revision,p_key);
    when 'goal' then perform public.record_match_event(game.id,'goal',(p_data->>'side')::public.field_side,null,null,null,'normal',null,null,'{}',p_revision,p_key);
    when 'finish' then perform public.finish_match(game.id,p_revision,p_key);
    when 'next' then perform public.complete_match_and_rotate(game.id,p_data->>'outcome',
      case when p_data->>'outcome' is not null then 'Desempate registrado pelo link de quadra' end,p_revision,p_key);
    else raise exception 'Invalid court action' using errcode='22023';
  end case;
  update public.audit_logs set reason=concat_ws(' · ',reason,'Link de quadra '||link.id::text)
    where session_id=link.session_id and idempotency_key=p_key and coalesce(reason,'') not like '%Link de quadra%';
  perform set_config('request.jwt.claims',coalesce(original_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);
end;
$$;
revoke all on function public.court_day_command(uuid,text,text,jsonb,bigint,uuid) from public;
grant execute on function public.court_day_command(uuid,text,text,jsonb,bigint,uuid) to anon,authenticated;
commit;
