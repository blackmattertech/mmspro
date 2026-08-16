-- QUERY NAME: 51-warranty-vendor-link — Link warranties to vendor master
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 50-vendor-master.sql
-- ══════════════════════════════════════════════════════════════

alter table public.warranties
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

create index if not exists idx_warranties_vendor_id
  on public.warranties(vendor_id);
