-- QUERY NAME: 46-work-request-form-field-values — Breakdown / maintenance field values on work requests
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 45-work-request-draft-number.sql
-- ══════════════════════════════════════════════════════════════

alter table public.work_requests
  add column if not exists form_field_values jsonb default '{}'::jsonb not null;
