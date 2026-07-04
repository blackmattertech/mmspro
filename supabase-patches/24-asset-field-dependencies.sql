-- QUERY NAME: 24-asset-field-dependencies — Conditional visibility between parent fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 23-org-limits.sql
-- Parent fields can depend on a dropdown option in another parent field
-- ══════════════════════════════════════════════════════════════

alter table public.asset_fields
  add column if not exists depends_on_parent_id uuid references public.asset_fields(id) on delete set null,
  add column if not exists depends_on_option text;

create index if not exists idx_asset_fields_depends_on_parent
  on public.asset_fields(depends_on_parent_id);
