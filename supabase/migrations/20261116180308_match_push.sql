begin;

create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create table private.match_push_devices (
  ranka_id uuid not null references public.rankas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  renewed_at timestamptz not null default now(),
  primary key (ranka_id, user_id, endpoint)
);
alter table private.match_push_devices enable row level security;

create table private.match_push_queue (
  match_id uuid primary key references public.matches(id) on delete cascade,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  revision bigint not null
);
alter table private.match_push_queue enable row level security;

create function public.get_match_push_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rankae_vapid_public'
$$;

create function public.set_match_push_device(p_ranka_id uuid, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_ranka(p_ranka_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_endpoint is null or length(p_endpoint) > 2048 or p_endpoint !~
    '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*push[.]apple[.]com)/[^[:space:]]+$' then
    raise exception 'Unsupported push service' using errcode = '22023';
  end if;
  if p_p256dh is null or p_auth is null then
    delete from private.match_push_devices where ranka_id = p_ranka_id and endpoint = p_endpoint and user_id = (select auth.uid());
    return;
  end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Invalid push keys' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ranka_id::text || (select auth.uid())::text, 0));
  if (select count(*) from private.match_push_devices where ranka_id = p_ranka_id and user_id = (select auth.uid())
      and endpoint <> p_endpoint and renewed_at > now() - interval '90 days') >= 5 then
    raise exception 'Too many devices' using errcode = 'PT409';
  end if;
  insert into private.match_push_devices (ranka_id, user_id, endpoint, p256dh, auth_key)
  values (p_ranka_id, (select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (ranka_id, user_id, endpoint) do update
    set p256dh = excluded.p256dh, auth_key = excluded.auth_key, renewed_at = now();
  insert into private.match_push_queue (match_id, revision)
    select id, revision from public.matches where ranka_id = p_ranka_id and state in ('live','overtime_live')
    on conflict (match_id) do nothing;
end;
$$;
revoke all on function public.get_match_push_key(), public.set_match_push_device(uuid,text,text,text) from public, anon;
grant execute on function public.get_match_push_key(), public.set_match_push_device(uuid,text,text,text) to authenticated;

create function public.has_match_push_device(p_ranka_id uuid, p_endpoint text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_ranka(p_ranka_id) and exists (
    select 1 from private.match_push_devices where ranka_id = p_ranka_id and endpoint = p_endpoint
      and user_id = (select auth.uid()) and renewed_at > now() - interval '90 days'
  )
$$;
revoke all on function public.has_match_push_device(uuid,text) from public, anon;
grant execute on function public.has_match_push_device(uuid,text) to authenticated;

create function private.queue_match_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state in ('ready','cancelled') then
    delete from private.match_push_queue where match_id = new.id;
    return new;
  end if;
  if old.state = 'completed' or new.state not in ('live','overtime_live','paused','overtime_paused','tie_break','completed')
    or not exists (select 1 from private.match_push_devices where ranka_id = new.ranka_id and renewed_at > now() - interval '90 days') then
    return new;
  end if;
  insert into private.match_push_queue (match_id, revision) values (new.id, new.revision)
  on conflict (match_id) do update set queued_at = now(), claimed_at = null, revision = excluded.revision;
  return new;
end;
$$;
revoke all on function private.queue_match_push() from public, anon, authenticated;
create trigger queue_match_push after update of revision on public.matches
for each row when (new.revision is distinct from old.revision) execute function private.queue_match_push();

create function public.claim_match_push(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  worker_token text;
  vapid_private text;
  vapid_public text;
  payload jsonb;
begin
  select decrypted_secret into worker_token from vault.decrypted_secrets where name = 'rankae_match_push_worker';
  if worker_token is null or nullif(p_token, '') is distinct from worker_token then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select decrypted_secret into vapid_private from vault.decrypted_secrets where name = 'rankae_vapid_private';
  select decrypted_secret into vapid_public from vault.decrypted_secrets where name = 'rankae_vapid_public';
  if vapid_private is null or vapid_public is null then return null; end if;
  with pending as (
    select match_id from private.match_push_queue
    where queued_at > now() - interval '10 minutes'
      and (claimed_at is null or claimed_at < now() - interval '30 seconds')
    order by queued_at limit 8 for update skip locked
  ), claimed as (
    update private.match_push_queue q set claimed_at = now() from pending p
    where q.match_id = p.match_id returning q.match_id, q.revision
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'rankaId', m.ranka_id, 'revision', c.revision,
    'ordinal', m.ordinal, 'state', m.state, 'startedAt', m.started_at_server,
    'durationMs', m.duration_limit_ms, 'elapsedMs', m.elapsed_ms_before_start,
    'yellow', score.yellow, 'red', score.red, 'devices', devices.items)), '[]'::jsonb)
  into payload
  from claimed c join public.matches m on m.id = c.match_id
  join public.organizations o on o.id = m.org_id
  cross join lateral (
    select count(*) filter (where e.side = 'yellow') as yellow, count(*) filter (where e.side = 'red') as red
    from public.match_events e where e.match_id = m.id and e.status = 'active'
      and (e.event_type = 'goal' or (e.event_type = 'penalty_attempt' and e.penalty_outcome = 'converted'))
  ) score
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth_key)), '[]'::jsonb) items
    from private.match_push_devices d where d.ranka_id = m.ranka_id and d.renewed_at > now() - interval '90 days'
      and (d.user_id = o.owner_user_id or exists (
        select 1 from public.organization_members om where om.org_id = o.id and om.user_id = d.user_id and om.active
          and ((om.workspace_access and om.role = 'organizer') or exists (
            select 1 from public.ranka_organizers ro where ro.ranka_id = m.ranka_id and ro.member_id = om.id))
      ))
  ) devices;
  return jsonb_build_object('privateKey', vapid_private, 'publicKey', vapid_public, 'matches', payload);
end;
$$;

create function public.ack_match_push(p_match_id uuid, p_revision bigint, p_expired text[]) returns void
language sql security definer set search_path = '' as $$
  delete from private.match_push_devices where endpoint = any(p_expired);
  delete from private.match_push_queue where match_id = p_match_id and revision = p_revision;
$$;
revoke all on function public.claim_match_push(text), public.ack_match_push(uuid,bigint,text[]) from public, anon, authenticated;
grant execute on function public.claim_match_push(text), public.ack_match_push(uuid,bigint,text[]) to service_role;

create function private.dispatch_match_push() returns void
language plpgsql set search_path = '' as $$
declare service_url text; worker_token text; gateway_key text;
begin
  delete from private.match_push_queue where queued_at <= now() - interval '10 minutes';
  if not exists (select 1 from private.match_push_queue where claimed_at is null or claimed_at < now() - interval '30 seconds') then return; end if;
  select decrypted_secret into service_url from vault.decrypted_secrets where name = 'rankae_match_push_url';
  select decrypted_secret into worker_token from vault.decrypted_secrets where name = 'rankae_match_push_worker';
  select decrypted_secret into gateway_key from vault.decrypted_secrets where name = 'rankae_match_push_gateway';
  if service_url is null or worker_token is null or gateway_key is null then return; end if;
  perform net.http_post(url := service_url, headers := jsonb_build_object('content-type','application/json',
    'authorization', 'Bearer ' || gateway_key, 'x-ranka-worker', worker_token),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
end;
$$;
revoke all on function private.dispatch_match_push() from public, anon, authenticated;
select cron.schedule('rankae-match-deadlines', '10 seconds', 'select private.process_match_deadlines(); select private.dispatch_match_push();');

commit;
