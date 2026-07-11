-- QUERY NAME: 27-performance-indexes — Performance indexes for hot API paths
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 26-location-heads.sql
-- ══════════════════════════════════════════════════════════════

-- Manual work order list/query paths
create index if not exists idx_manual_work_orders_org_created_at
  on public.manual_work_orders(org_id, created_at desc);

create index if not exists idx_manual_work_orders_org_status_created_at
  on public.manual_work_orders(org_id, status, created_at desc);

create index if not exists idx_manual_work_orders_org_created_by_created_at
  on public.manual_work_orders(org_id, created_by, created_at desc);

-- Work order assignee lookup paths
create index if not exists idx_wo_assignees_org_employee_work_order
  on public.manual_work_order_assignees(org_id, employee_id, work_order_id);

create index if not exists idx_wo_assignees_org_work_order_employee
  on public.manual_work_order_assignees(org_id, work_order_id, employee_id);

-- Manual work order value lookup paths
create index if not exists idx_manual_wo_values_org_work_order
  on public.manual_work_order_values(org_id, work_order_id);

create index if not exists idx_manual_wo_values_summary_scan
  on public.manual_work_order_values(org_id, work_order_id, created_at)
  where value_text is not null;

-- Profiles and login checks
create index if not exists idx_profiles_org_id
  on public.profiles(org_id);

create index if not exists idx_profiles_org_lower_email
  on public.profiles(org_id, lower(email));

create index if not exists idx_profiles_created_at
  on public.profiles(created_at desc);

-- Employee filter/sort paths
create index if not exists idx_org_employees_org_profile_active
  on public.org_employees(org_id, profile_id)
  where is_active = true;

create index if not exists idx_org_employees_org_active_name
  on public.org_employees(org_id, is_active, name);

create index if not exists idx_org_employees_org_department_name
  on public.org_employees(org_id, department_id, name);

create index if not exists idx_org_employees_org_location_name
  on public.org_employees(org_id, location_id, name);

create index if not exists idx_org_employees_org_designation_name
  on public.org_employees(org_id, designation_id, name);

-- Department and location list paths
create index if not exists idx_departments_org_name
  on public.departments(org_id, name);

create index if not exists idx_departments_org_location_name
  on public.departments(org_id, location_id, name);

create index if not exists idx_departments_org_all_locations_name
  on public.departments(org_id, all_locations, name);

create index if not exists idx_org_locations_org_primary_name
  on public.org_locations(org_id, is_primary desc, name);

-- Department location heads sync path
create index if not exists idx_department_location_heads_org_department
  on public.department_location_heads(org_id, department_id);

-- Asset fields schema load path
create index if not exists idx_asset_fields_org_sort_name
  on public.asset_fields(org_id, sort_order, name);
