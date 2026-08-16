-- QUERY NAME: 48-warranty-tasks-permissions — Warranty Manager & Tasks & Follow-ups modules
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 47-approve-permissions.sql
-- ══════════════════════════════════════════════════════════════
-- Grants the new modules to roles that already have calendar access.

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
    ('warranty_manager'),
    ('tasks_followups')
) as child(module_key)
where p.module_key = 'calendar'
  and p.can_read = true
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = child.module_key
  );
