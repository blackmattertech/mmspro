-- QUERY NAME: 11-employee-login — Employee login access
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 10-org-employees.sql
-- ══════════════════════════════════════════════════════════════

alter table public.org_employees
  add column if not exists login_required boolean default false not null;

alter table public.org_employees
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_org_employees_profile_id on public.org_employees(profile_id);
