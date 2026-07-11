-- QUERY NAME: 26-location-heads — Location head employee
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 25-asset-section-icons.sql
-- ══════════════════════════════════════════════════════════════

alter table public.org_locations
  add column if not exists head_employee_id uuid references public.org_employees(id) on delete set null;

create index if not exists idx_org_locations_head_employee_id
  on public.org_locations(head_employee_id);
