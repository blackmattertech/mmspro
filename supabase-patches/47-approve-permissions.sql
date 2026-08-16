-- QUERY NAME: 47-approve-permissions — Work request / work order approve module keys
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 46-work-request-form-field-values.sql
-- ══════════════════════════════════════════════════════════════
-- Grants the new approve permissions to roles that already had update on
-- incoming work requests or received work orders.

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  'work_request_approve',
  false,
  false,
  true,
  false
from public.org_access_role_permissions p
where p.module_key = 'work_request_incoming'
  and p.can_update = true
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = 'work_request_approve'
  );

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  'work_orders_approve',
  false,
  false,
  true,
  false
from public.org_access_role_permissions p
where p.module_key in ('work_orders_received', 'work_orders')
  and p.can_update = true
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = 'work_orders_approve'
  );
