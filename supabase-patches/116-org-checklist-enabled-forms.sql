-- QUERY NAME: 116-org-checklist-enabled-forms — Which forms may use checklists
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 115-org-table-column-defaults.sql
-- Empty array = all checklist-capable forms enabled (existing behaviour).
-- ══════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists checklist_enabled_form_ids text[] not null default '{}';

comment on column public.organizations.checklist_enabled_form_ids is
  'Form ids where checklists can be used. Empty = all checklist forms enabled.';
