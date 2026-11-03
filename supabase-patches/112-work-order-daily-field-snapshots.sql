-- QUERY NAME: 112-work-order-daily-field-snapshots — Full execution field snapshots per calendar day
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 111-work-order-manual-progress.sql
-- Stores all post-start execution fields (incl. checklist) on each daily log row.
-- ══════════════════════════════════════════════════════════════

alter table public.work_order_daily_logs
  add column if not exists field_snapshot jsonb not null default '{}'::jsonb;

comment on column public.work_order_daily_logs.field_snapshot is
  'Full execution field snapshot for the day: native fields, checklist_values, process_extras, materials';

-- Calendar-day snapshots no longer require ending the previous day first.
drop index if exists public.idx_work_order_daily_logs_one_open;

-- Backfill legacy columns into field_snapshot when empty
update public.work_order_daily_logs
set field_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'work_done', work_done,
  'remarks', remarks,
  'labour_count', labour_count,
  'material_rows', coalesce(materials, '[]'::jsonb),
  'checklist_values', '{}'::jsonb,
  'process_extras', '{}'::jsonb
))
where field_snapshot = '{}'::jsonb
  and (
    work_done is not null
    or remarks is not null
    or labour_count is not null
    or (materials is not null and materials <> '[]'::jsonb)
  );
