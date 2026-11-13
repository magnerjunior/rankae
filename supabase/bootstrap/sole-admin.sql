-- Run only on the verified project, before inviting any other account.
begin;
do $$
declare sole_user uuid;
begin
  lock table auth.users in share mode;
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Expected exactly one Auth user; verify the intended account before proceeding';
  end if;
  select id into strict sole_user from auth.users;
  insert into public.platform_admins(user_id, created_by)
  values (sole_user, sole_user)
  on conflict (user_id) do update set active = true, deactivated_at = null;
end;
$$;
commit;
