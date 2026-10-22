-- QUERY NAME: 82-warranty-item-terms — Per-line purchase/PO/invoice/warranty fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 81-form-field-values-text-id.sql
-- Moves commercial + warranty-period attributes onto warranty_items so each
-- product/material can differ. Backfills from parent warranties. Header columns
-- remain as rollups for list/status/calendar compatibility.
-- ══════════════════════════════════════════════════════════════

alter table public.warranty_items
  add column if not exists purchase_date date,
  add column if not exists make text,
  add column if not exists po_number text,
  add column if not exists po_date date,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists warranty_start date,
  add column if not exists warranty_end date,
  add column if not exists warranty_period_months integer,
  add column if not exists expiry_notification_days integer;

-- Backfill from parent warranty when item fields are empty
update public.warranty_items wi
set
  purchase_date = coalesce(wi.purchase_date, w.purchase_date),
  make = coalesce(nullif(trim(wi.make), ''), w.make),
  po_number = coalesce(nullif(trim(wi.po_number), ''), w.po_number),
  po_date = coalesce(wi.po_date, w.po_date),
  invoice_number = coalesce(nullif(trim(wi.invoice_number), ''), w.invoice_number),
  invoice_date = coalesce(wi.invoice_date, w.invoice_date),
  warranty_start = coalesce(wi.warranty_start, w.warranty_start),
  warranty_end = coalesce(wi.warranty_end, w.warranty_end),
  warranty_period_months = coalesce(wi.warranty_period_months, w.warranty_period_months),
  expiry_notification_days = coalesce(wi.expiry_notification_days, w.expiry_notification_days)
from public.warranties w
where w.id = wi.warranty_id
  and (
    wi.purchase_date is null
    or wi.make is null
    or wi.po_number is null
    or wi.po_date is null
    or wi.invoice_number is null
    or wi.invoice_date is null
    or wi.warranty_start is null
    or wi.warranty_end is null
    or wi.warranty_period_months is null
    or wi.expiry_notification_days is null
  );

create index if not exists idx_warranty_items_org_end
  on public.warranty_items(org_id, warranty_end);

create index if not exists idx_warranty_items_warranty_end
  on public.warranty_items(warranty_id, warranty_end);
