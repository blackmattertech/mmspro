-- QUERY NAME: 32-expand-access-module-keys — Split company/WO/report permissions
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 31-seed-location-head-role.sql
-- ══════════════════════════════════════════════════════════════
-- Copies legacy parent permissions onto new child module keys when missing.
-- Also copies company → locations/departments/designations when those rows
-- do not exist yet (older roles used company for all company masters).

-- Work Orders: work_orders → received/assigned/scheduled/manual
insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  child.module_key,
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete
from public.org_access_role_permissions p
cross join (
  values
    ('work_orders_received'),
    ('work_orders_assigned'),
    ('work_orders_scheduled'),
    ('work_orders_manual')
) as child(module_key)
where p.module_key = 'work_orders'
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = child.module_key
  );

-- Reports: reports → report children
insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  child.module_key,
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete
from public.org_access_role_permissions p
cross join (
  values
    ('reports_daily_logs'),
    ('reports_plant_wise'),
    ('reports_open_logs'),
    ('reports_completed_logs'),
    ('reports_overdue')
) as child(module_key)
where p.module_key = 'reports'
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = child.module_key
  );

-- Company masters: company → locations/departments/designations
insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  child.module_key,
  p.can_update,
  p.can_read,
  p.can_update,
  p.can_update
from public.org_access_role_permissions p
cross join (
  values
    ('locations'),
    ('departments'),
    ('designations')
) as child(module_key)
where p.module_key = 'company'
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = child.module_key
  );
