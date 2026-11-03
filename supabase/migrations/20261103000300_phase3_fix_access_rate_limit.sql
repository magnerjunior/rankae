begin;

create or replace function public.exchange_public_portal_access(
  p_slug text,
  p_link_token text,
  p_pin text,
  p_grant_token text,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
  v_fingerprint_hash text;
  recent_failures integer;
  allowed boolean := false;
  grant_expiry timestamptz := clock_timestamp() + interval '2 hours';
begin
  if p_grant_token is null or char_length(p_grant_token) < 32 or p_fingerprint is null then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;
  select * into target from public.rankas where slug = lower(trim(p_slug));
  if target.id is null or target.visibility = 'private_off' then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;
  if target.visibility = 'public' then
    return jsonb_build_object('authorized', true, 'status', 'public');
  end if;

  v_fingerprint_hash := private.hash_portal_secret(target.id::text || ':' || p_fingerprint);
  select count(*) into recent_failures
  from public.portal_access_attempts attempt
  where attempt.ranka_id = target.id
    and attempt.fingerprint_hash = v_fingerprint_hash
    and not attempt.succeeded
    and attempt.attempted_at > clock_timestamp() - interval '15 minutes';

  if recent_failures >= 5 then
    return jsonb_build_object('authorized', false, 'status', 'locked', 'retry_after_seconds', 900);
  end if;

  allowed := target.invite_token_hash is not null
    and p_link_token is not null
    and private.hash_portal_secret(p_link_token) = target.invite_token_hash;
  if target.visibility = 'pin_protected' then
    allowed := allowed and p_pin is not null and target.pin_hash is not null
      and extensions.crypt(p_pin, target.pin_hash) = target.pin_hash;
  end if;

  insert into public.portal_access_attempts(ranka_id, fingerprint_hash, succeeded)
  values (target.id, v_fingerprint_hash, allowed);

  if not allowed then
    return jsonb_build_object('authorized', false, 'status', 'invalid');
  end if;

  delete from public.portal_access_grants
  where ranka_id = target.id and expires_at < clock_timestamp() - interval '1 day';
  insert into public.portal_access_grants(ranka_id, grant_hash, scope, expires_at)
  values (target.id, private.hash_portal_secret(p_grant_token), target.visibility::text, grant_expiry);
  return jsonb_build_object('authorized', true, 'status', 'granted', 'expires_at', grant_expiry);
end;
$$;

revoke all on function public.exchange_public_portal_access(text, text, text, text, text) from public;
grant execute on function public.exchange_public_portal_access(text, text, text, text, text) to anon, authenticated;

commit;
