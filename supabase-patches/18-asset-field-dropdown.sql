-- QUERY NAME: 18-asset-field-dropdown — Allow dropdown field type
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 17-asset-fields.sql
-- ══════════════════════════════════════════════════════════════

alter table public.asset_fields drop constraint if exists asset_fields_field_type_check;

alter table public.asset_fields add constraint asset_fields_field_type_check check (
  field_type is null
  or field_type in (
    'text', 'textarea', 'number', 'date', 'datetime',
    'image', 'file', 'checkbox', 'dropdown'
  )
);
