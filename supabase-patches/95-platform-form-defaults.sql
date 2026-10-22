-- QUERY NAME: 95-platform-form-defaults — Default form per module for new companies
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 94-task-equipment-reference.sql
-- One saved layout per form. New companies receive a copy, including the
-- catalog questions that layout uses.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.platform_form_defaults (
  form_id text primary key,
  module_id text not null,
  layout jsonb not null,
  catalog jsonb not null default '[]'::jsonb,
  source_org_id uuid references public.organizations(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.platform_form_defaults enable row level security;

comment on table public.platform_form_defaults is
  'Super Admin default form per module. Copied onto each new company.';
