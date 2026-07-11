-- QUERY NAME: 31-seed-location-head-role — Optional Location Head template
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 30-access-roles-all-locations.sql
-- ══════════════════════════════════════════════════════════════
-- Creates an org-wide "Location Head" access role (with sensible defaults)
-- for every organization that does not already have one by that name.
-- Does not assign the role to employees — admins assign in Roles & Access.

insert into public.org_access_roles (org_id, location_id, name, description, is_active)
select
  o.id,
  null,
  'Location Head',
  'Oversees operations, teams, and resources at their assigned location.',
  true
from public.organizations o
where not exists (
  select 1
  from public.org_access_roles r
  where r.org_id = o.id
    and r.name = 'Location Head'
    and r.location_id is null
);

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  r.id,
  m.module_key,
  m.can_create,
  m.can_read,
  m.can_update,
  m.can_delete
from public.org_access_roles r
cross join (
  values
    ('dashboard', false, true, false, false),
    ('work_orders_received', true, true, true, true),
    ('work_orders_assigned', true, true, true, true),
    ('work_orders_scheduled', true, true, true, true),
    ('work_orders_manual', true, true, true, true),
    ('calendar', true, true, true, false),
    ('reports_daily_logs', false, true, false, false),
    ('reports_plant_wise', false, true, false, false),
    ('reports_open_logs', false, true, false, false),
    ('reports_completed_logs', false, true, false, false),
    ('reports_overdue', false, true, false, false),
    ('company', false, true, false, false),
    ('locations', false, true, false, false),
    ('departments', false, true, false, false),
    ('designations', false, true, false, false),
    ('employees', true, true, true, false),
    ('assets', false, true, false, false),
    ('roles_access', true, true, true, true),
    ('settings', false, false, false, false)
) as m(module_key, can_create, can_read, can_update, can_delete)
where r.name = 'Location Head'
  and r.location_id is null
  and not exists (
    select 1
    from public.org_access_role_permissions p
    where p.role_id = r.id
      and p.module_key = m.module_key
  );
