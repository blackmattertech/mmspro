-- QUERY NAME: 107-org-form-field-options — Company option lists for Superadmin form dropdowns
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 106-platform-hierarchy-defaults.sql
-- Company overrides for dropdown / radio / checkbox options on a form field.
-- Missing row = Superadmin layout options, named Job Nature field, or built-in list.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_form_field_options (
  org_id uuid not null references public.organizations(id) on delete cascade,
  form_id text not null,
  field_id text not null,
  options jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, form_id, field_id)
);

create index if not exists idx_org_form_field_options_org
  on public.org_form_field_options(org_id);

alter table public.org_form_field_options enable row level security;

drop policy if exists "Org members read form field options" on public.org_form_field_options;
create policy "Org members read form field options"
  on public.org_form_field_options for select
  using (org_id = public.current_user_org_id());

comment on table public.org_form_field_options is
  'Company-editable option lists for Superadmin form dropdowns. Does not change org_form_layouts.';
