-- QUERY NAME: 40-field-required — Mandatory flag for parent fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 39-drop-designations-department-heads.sql
-- Adds is_required to asset_fields and equipment_fields.
-- Only meaningful for kind = 'parent'; sections and children stay false.
-- ══════════════════════════════════════════════════════════════

alter table public.asset_fields
  add column if not exists is_required boolean default false not null;

comment on column public.asset_fields.is_required is
  'Parent fields only: value must be filled on asset / work order forms';

alter table public.equipment_fields
  add column if not exists is_required boolean default false not null;

comment on column public.equipment_fields.is_required is
  'Parent fields only: value must be filled on equipment forms';
