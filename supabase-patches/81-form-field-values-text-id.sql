-- QUERY NAME: 81-form-field-values-text-id — Store master picker keys on form extras
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 80-org-form-layouts.sql
-- field_id was uuid (catalog fields). Master pickers use text ids such as master:locations.
-- ══════════════════════════════════════════════════════════════

alter table public.org_form_field_values
  alter column field_id type text using field_id::text;

comment on column public.org_form_field_values.field_id is
  'Catalog field uuid, or master:<source> / catalog:<uuid> layout id.';
