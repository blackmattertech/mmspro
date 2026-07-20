-- QUERY NAME: 41-field-type-radio — Allow radio field type
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 40-field-required.sql
-- Adds radio as a single-choice option field (like dropdown).
-- ══════════════════════════════════════════════════════════════

alter table public.asset_fields drop constraint if exists asset_fields_field_type_check;

alter table public.asset_fields add constraint asset_fields_field_type_check check (
  field_type is null
  or field_type in (
    'text', 'textarea', 'number', 'date', 'datetime',
    'image', 'file', 'checkbox', 'dropdown', 'radio'
  )
);

alter table public.equipment_fields drop constraint if exists equipment_fields_field_type_check;

alter table public.equipment_fields add constraint equipment_fields_field_type_check check (
  field_type is null
  or field_type in (
    'text', 'textarea', 'number', 'date', 'datetime',
    'image', 'file', 'checkbox', 'dropdown', 'radio'
  )
);
