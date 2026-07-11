-- QUERY NAME: 34-location-head-roles-access — Location Head can manage Roles & Access
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 33-access-roles-created-by.sql
-- ══════════════════════════════════════════════════════════════
-- Location Heads may create/edit/delete/assign roles they create
-- (server still hides admin-created roles via created_by).

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  r.id,
  'roles_access',
  true,
  true,
  true,
  true
from public.org_access_roles r
where r.name = 'Location Head'
  and r.location_id is null
  and not exists (
    select 1
    from public.org_access_role_permissions p
    where p.role_id = r.id
      and p.module_key = 'roles_access'
  );

update public.org_access_role_permissions p
set
  can_create = true,
  can_read = true,
  can_update = true,
  can_delete = true
from public.org_access_roles r
where p.role_id = r.id
  and r.name = 'Location Head'
  and r.location_id is null
  and p.module_key = 'roles_access';
