-- QUERY NAME: 30-access-roles-all-locations — Access roles are org-wide
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 29-account-roles.sql
-- ══════════════════════════════════════════════════════════════
-- Access roles define module permissions for the whole org.
-- Employees remain limited to their own location separately.
-- Skips rows that would collide with an existing all-locations role of the same name.

update public.org_access_roles r
set location_id = null,
    updated_at = now()
where r.location_id is not null
  and not exists (
    select 1
    from public.org_access_roles other
    where other.org_id = r.org_id
      and other.name = r.name
      and other.id <> r.id
      and other.location_id is null
  );
