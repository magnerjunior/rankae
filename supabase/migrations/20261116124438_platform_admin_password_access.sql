-- Allow password-authenticated sessions for users with an active platform role.
-- Existing grants, role assignments and privileged audit records are preserved.
create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.has_platform_admin_role();
$$;
