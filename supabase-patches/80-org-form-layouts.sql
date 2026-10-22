-- QUERY NAME: 80-org-form-layouts — Per-module Super Admin form layouts
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 79-org-disabled-modules.sql
-- No rows = company forms keep their current hardcoded / catalog order.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_form_layouts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  form_id text not null,
  layout jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, form_id)
);

create index if not exists idx_org_form_layouts_org on public.org_form_layouts(org_id);

create table if not exists public.org_form_field_values (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  form_id text not null,
  record_id uuid not null,
  field_id uuid not null,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, form_id, record_id, field_id)
);

create index if not exists idx_org_form_field_values_record
  on public.org_form_field_values(org_id, form_id, record_id);

alter table public.org_form_layouts enable row level security;
alter table public.org_form_field_values enable row level security;

drop policy if exists "Org members read form layouts" on public.org_form_layouts;
create policy "Org members read form layouts"
  on public.org_form_layouts for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members read form field values" on public.org_form_field_values;
create policy "Org members read form field values"
  on public.org_form_field_values for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert form field values" on public.org_form_field_values;
create policy "Org members insert form field values"
  on public.org_form_field_values for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update form field values" on public.org_form_field_values;
create policy "Org members update form field values"
  on public.org_form_field_values for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete form field values" on public.org_form_field_values;
create policy "Org members delete form field values"
  on public.org_form_field_values for delete
  using (org_id = public.current_user_org_id());

comment on table public.org_form_layouts is
  'Super Admin per-org, per-form layout JSON. Missing row = current default form.';

comment on table public.org_form_field_values is
  'Catalog field values attached to hardcoded module records.';
