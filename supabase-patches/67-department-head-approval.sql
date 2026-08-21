-- QUERY NAME: 67-department-head-approval — Department Head approval & role assignment
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 66-work-request-short-description.sql
-- Seeds an org-wide "Department Head" access role with work request /
-- work order approval and Roles & Access, so heads can assign approvers
-- from their team. Also backfills existing roles named Department Head.
-- ══════════════════════════════════════════════════════════════

insert into public.org_access_roles (org_id, location_id, name, description, is_active)
select
  o.id,
  null,
  'Department Head',
  'Approves work requests and work orders for their department, and can assign approval access to team members.',
  true
from public.organizations o
where not exists (
  select 1
  from public.org_access_roles r
  where r.org_id = o.id
    and lower(btrim(r.name)) = 'department head'
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
    ('work_request_create', true, true, true, true),
    ('work_request_my', true, true, true, true),
    ('work_request_incoming', true, true, true, true),
    ('work_request_approve', false, false, true, false),
    ('work_request_outgoing', true, true, true, true),
    ('work_orders_received', true, true, true, true),
    ('work_orders_approve', false, false, true, false),
    ('work_orders_assigned', true, true, true, false),
    ('calendar', false, true, false, false),
    ('employees', false, true, false, false),
    ('departments', false, true, false, false),
    ('locations', false, true, false, false),
    ('equipment', false, true, false, false),
    ('roles_access', true, true, true, true)
) as m(module_key, can_create, can_read, can_update, can_delete)
where lower(btrim(r.name)) = 'department head'
  and r.location_id is null
  and not exists (
    select 1
    from public.org_access_role_permissions p
    where p.role_id = r.id
      and p.module_key = m.module_key
  );

update public.org_access_role_permissions p
set
  can_create = p.can_create or m.can_create,
  can_read = p.can_read or m.can_read,
  can_update = p.can_update or m.can_update,
  can_delete = p.can_delete or m.can_delete
from public.org_access_roles r,
  (
    values
      ('work_request_incoming', true, true, true, true),
      ('work_request_approve', false, false, true, false),
      ('work_orders_received', true, true, true, true),
      ('work_orders_approve', false, false, true, false),
      ('employees', false, true, false, false),
      ('roles_access', true, true, true, true)
  ) as m(module_key, can_create, can_read, can_update, can_delete)
where p.role_id = r.id
  and p.module_key = m.module_key
  and lower(btrim(r.name)) = 'department head'
  and r.location_id is null;
