-- QUERY NAME: 39-drop-designations-department-heads — Remove designation + department head
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 38-equipment-inventory.sql
-- Removes Designation master and Department Head storage.
-- Does NOT touch Location Head (org_locations.head_employee_id) or manager_id.
-- See docs/designation-and-department-head.md for restore notes.
-- ══════════════════════════════════════════════════════════════

-- Access-role permission rows for removed module
delete from public.org_access_role_permissions
where module_key = 'designations';

-- Employee → designation FK / column / indexes
drop index if exists public.idx_org_employees_org_designation_name;
drop index if exists public.idx_org_employees_designation_id;

alter table public.org_employees
  drop column if exists designation_id;

-- Designation mapping + master (policies drop with tables)
drop table if exists public.designation_departments cascade;
drop table if exists public.designations cascade;

-- Per-location department heads
drop table if exists public.department_location_heads cascade;

-- Single department head + mode flag on departments
drop index if exists public.idx_departments_head_employee_id;

alter table public.departments
  drop column if exists head_employee_id;

alter table public.departments
  drop column if exists per_location_heads;
