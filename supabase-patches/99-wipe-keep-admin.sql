-- QUERY NAME: 99-wipe-keep-admin — Delete all app data except Super Admin profiles
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | DESTRUCTIVE | Does NOT delete auth.users by itself
-- Prefer the Node script (handles RESTRICT FKs + auth + storage):
--   CONFIRM=DELETE_ALL_EXCEPT_ADMIN npm run wipe:keep-admin --prefix server
--
-- This SQL keeps profiles where role = 'super_admin', clears their org_id,
-- deletes RESTRICT blockers, deletes all organizations (cascade), then
-- deletes other profiles. After running, delete non-admin auth users via
-- the Node script or Supabase Dashboard → Authentication.
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

  -- Clear sibling RESTRICT blockers before org delete
  delete from public.pm_plan_audit;
  delete from public.pm_plan_technicians;
  delete from public.pm_plans;
  delete from public.work_request_timeline;
  delete from public.work_requests;
  delete from public.equipment_values;
  delete from public.equipment;
  delete from public.task_activities;
  delete from public.task_comments;
  delete from public.task_attachments;
  delete from public.task_links;
  delete from public.task_reminders;
  delete from public.task_recurrence;
  delete from public.task_assignees;
  delete from public.task_tag_assignments;
  delete from public.task_references;
  delete from public.tasks;

  -- Cascades locations, employees, roles, work orders, assets, etc.
  delete from public.organizations;

  -- Leftover non–Super Admin profiles (e.g. org_id was already null)
  delete from public.profiles
  where role is distinct from 'super_admin';
end $$;
