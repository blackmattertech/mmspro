-- QUERY NAME: 43-equipment-dynamic-identity — Equipment name/code optional + image
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 42-equipment-share-asset-sections.sql
-- Equipment identity now comes from Super Admin defined dynamic fields.
-- name/code are derived from those fields (a field named like "code" is the
-- unique key), so the fixed columns become optional. Adds a single image path.
-- ══════════════════════════════════════════════════════════════

-- 1. Fixed name/code are now derived from dynamic fields, so allow null.
alter table public.equipment alter column name drop not null;
alter table public.equipment alter column code drop not null;

-- 2. Single equipment image (stored in the org-assets bucket).
alter table public.equipment add column if not exists image_path text;

-- Note: the existing unique (org_id, code) constraint still enforces unique
-- codes; Postgres treats null codes as distinct so equipment without a code
-- field configured are allowed.
