-- QUERY NAME: 36-work-order-department-assignment — Assign work orders to a department
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 35-org-assets-employee-photos.sql
-- Allows assigning a manual work order to a department (+ location),
-- with or without specific employee assignees.
-- ══════════════════════════════════════════════════════════════

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

-- Department assignment always requires both department and location together
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_work_orders_dept_location_pair'
  ) then
    alter table public.manual_work_orders
      add constraint manual_work_orders_dept_location_pair
      check (
        (assigned_department_id is null and assigned_location_id is null)
        or (assigned_department_id is not null and assigned_location_id is not null)
      );
  end if;
end $$;
