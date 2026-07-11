-- QUERY NAME: 99-wipe-keep-admin — Delete all app data except Super Admin profiles
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | DESTRUCTIVE | Does NOT delete auth.users
-- Prefer: CONFIRM=DELETE_ALL_EXCEPT_ADMIN node server/scripts/wipe-keep-admin.js
--
-- This SQL keeps profiles where role = 'super_admin', clears their org_id,
-- deletes all organizations (cascade), then deletes other profiles.
-- After running, delete non-admin auth users via the Node script (step 4)
-- or Supabase Dashboard → Authentication.
-- ══════════════════════════════════════════════════════════════

do $$
declare
  admin_count integer;
begin
  select count(*) into admin_count
  from public.profiles
  where role = 'super_admin';

  if admin_count = 0 then
    raise exception 'No Super Admin profiles found (role = super_admin). Aborting.';
  end if;

  -- Detach Super Admins so org cascade cannot delete them
  update public.profiles
  set org_id = null
  where role = 'super_admin';

  -- Cascades locations, employees, roles, work orders, assets, etc.
  delete from public.organizations;

  -- Leftover non–Super Admin profiles (e.g. org_id was already null)
  delete from public.profiles
  where role is distinct from 'super_admin';
end $$;
