-- QUERY NAME: 108-org-form-skips — Company skip overlay for optional Superadmin form fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 107-org-form-field-options.sql
-- Company can skip optional Superadmin fields / WO technician acceptance.
-- Does not change org_form_layouts. Missing row = field stays on the form.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_form_skips (
  org_id uuid not null references public.organizations(id) on delete cascade,
  form_id text not null,
  kind text not null,
  target_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, form_id, kind, target_id),
  constraint org_form_skips_kind_check check (kind in ('field', 'section', 'process'))
);

create index if not exists idx_org_form_skips_org
  on public.org_form_skips(org_id);

create index if not exists idx_org_form_skips_org_form
  on public.org_form_skips(org_id, form_id);

alter table public.org_form_skips enable row level security;

drop policy if exists "Org members read form skips" on public.org_form_skips;
create policy "Org members read form skips"
  on public.org_form_skips for select
  using (org_id = public.current_user_org_id());

comment on table public.org_form_skips is
  'Company skip overlay for optional Superadmin form fields and WO technician acceptance. Does not change org_form_layouts.';
