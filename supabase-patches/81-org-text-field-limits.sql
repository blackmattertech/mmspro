-- QUERY NAME: 81-org-text-field-limits — Configurable text field character limits (Others → Character limits)
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 80-report-schedule-frequencies.sql
-- Org-configurable max lengths for shared text fields on work requests,
-- work orders, daily logs, tasks, and related forms.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_text_field_limits (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  field_key text not null,
  max_length integer not null check (max_length >= 10 and max_length <= 20000),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, field_key)
);

create index if not exists idx_org_text_field_limits_org
  on public.org_text_field_limits(org_id, field_key);

alter table public.org_text_field_limits enable row level security;

insert into public.org_text_field_limits (org_id, field_key, max_length)
select o.id, v.field_key, v.max_length
from public.organizations o
cross join (
  values
    ('short_description', 200),
    ('problem_description', 2000),
    ('remarks', 1000),
    ('job_description', 2000),
    ('root_cause', 2000),
    ('action_taken', 2000),
    ('material_consumed', 500),
    ('dos_and_donts', 2000),
    ('lessons_learned', 2000)
) as v(field_key, max_length)
where not exists (
  select 1
  from public.org_text_field_limits t
  where t.org_id = o.id and t.field_key = v.field_key
);
