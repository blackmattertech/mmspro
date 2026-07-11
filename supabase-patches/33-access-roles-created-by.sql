-- QUERY NAME: 33-access-roles-created-by — Track who created each access role
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 32-expand-access-module-keys.sql
-- ══════════════════════════════════════════════════════════════
-- Non-admins only see/manage roles they created. Org admins see all.
-- Existing rows with null created_by are treated as admin-owned (admin-only).

alter table public.org_access_roles
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_org_access_roles_created_by
  on public.org_access_roles(created_by);
