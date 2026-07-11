-- QUERY NAME: 37-work-order-assignment-cascade — Location-only assignment cascade
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 35-org-assets-employee-photos.sql
-- (Also covers 36 if that patch was skipped.)
-- ══════════════════════════════════════════════════════════════
-- Adds assigned_* columns if missing, then allows location-only assignment
-- (Location Head inbox). Department still requires a location.

alter table public.manual_work_orders
  add column if not exists assigned_department_id uuid references public.departments(id) on delete set null;

alter table public.manual_work_orders
  add column if not exists assigned_location_id uuid references public.org_locations(id) on delete set null;

create index if not exists idx_manual_wo_assigned_dept
  on public.manual_work_orders(org_id, assigned_department_id)
  where assigned_department_id is not null;

create index if not exists idx_manual_wo_assigned_loc
  on public.manual_work_orders(org_id, assigned_location_id)
  where assigned_location_id is not null;

-- Replace strict pair constraint with: department requires location
alter table public.manual_work_orders
  drop constraint if exists manual_work_orders_dept_location_pair;

alter table public.manual_work_orders
  drop constraint if exists manual_work_orders_dept_requires_location;

alter table public.manual_work_orders
  add constraint manual_work_orders_dept_requires_location
  check (
    assigned_department_id is null
    or assigned_location_id is not null
  );
