-- QUERY NAME: 100-warranty-document-lines — Documents belong to a warranty line
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 97-areas-optional-placement.sql
-- Each product row on the warranty form can have its own images and documents.
-- line_number matches warranty_items.line_number. Null means an older
-- warranty-level file, shown on the first row until it is saved again.
-- ══════════════════════════════════════════════════════════════

alter table public.warranty_documents
  add column if not exists line_number integer;

create index if not exists idx_warranty_documents_line
  on public.warranty_documents(warranty_id, line_number);
