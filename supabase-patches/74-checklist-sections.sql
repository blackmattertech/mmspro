-- QUERY NAME: 74-checklist-sections — Checklist template sections
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 73-org-statuses.sql
-- Adds sections to checklist templates for Masters → Others builder.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.checklist_template_sections (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  template_id uuid references public.checklist_templates(id) on delete cascade not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_checklist_sections_template
  on public.checklist_template_sections(template_id, sort_order, name);

create index if not exists idx_checklist_sections_org
  on public.checklist_template_sections(org_id);

alter table public.checklist_template_sections enable row level security;

drop policy if exists checklist_template_sections_org_all on public.checklist_template_sections;
create policy checklist_template_sections_org_all on public.checklist_template_sections
  for all using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

alter table public.checklist_template_fields
  add column if not exists section_id uuid references public.checklist_template_sections(id) on delete set null;

create index if not exists idx_checklist_fields_section
  on public.checklist_template_fields(section_id)
  where section_id is not null;
