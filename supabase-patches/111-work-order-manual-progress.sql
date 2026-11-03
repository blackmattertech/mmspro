-- QUERY NAME: 111-work-order-manual-progress — Manual progress on work orders
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 110-work-order-checklist-template.sql
-- Assigned technicians can save a progress percent. Null keeps the status fallback.
-- ══════════════════════════════════════════════════════════════

alter table public.manual_work_orders
  add column if not exists progress_percent smallint;

alter table public.manual_work_orders
  drop constraint if exists manual_work_orders_progress_percent_check;

alter table public.manual_work_orders
  add constraint manual_work_orders_progress_percent_check
  check (
    progress_percent is null
    or (progress_percent >= 0 and progress_percent <= 100)
  );

notify pgrst, 'reload schema';
