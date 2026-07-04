-- QUERY NAME: 21-work-order-assignment — Assign work orders to employees
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 20-work-order-assets-storage.sql
-- ══════════════════════════════════════════════════════════════

alter table public.manual_work_orders
  add column if not exists assigned_to uuid references public.org_employees(id) on delete set null;

create index if not exists idx_manual_work_orders_assigned_to
  on public.manual_work_orders(assigned_to);

create index if not exists idx_manual_work_orders_assigned_status
  on public.manual_work_orders(org_id, assigned_to, status);
