-- QUERY NAME: 13-managers-department-heads-codes — Managers, dept heads, dept codes
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 12-employee-emails.sql
-- ══════════════════════════════════════════════════════════════

-- Department code (locations already have code)
alter table public.departments
  add column if not exists code text;

update public.departments
set code = upper(substr(replace(id::text, '-', ''), 1, 8))
where code is null or trim(code) = '';

alter table public.departments
  alter column code set not null;

create unique index if not exists idx_departments_org_id_code
  on public.departments (org_id, code);

-- Employee reporting manager (self-reference)
alter table public.org_employees
  add column if not exists manager_id uuid references public.org_employees(id) on delete set null;

create index if not exists idx_org_employees_manager_id
  on public.org_employees(manager_id);

-- Department head (any department, including all-locations)
alter table public.departments
  add column if not exists head_employee_id uuid references public.org_employees(id) on delete set null;

create index if not exists idx_departments_head_employee_id
  on public.departments(head_employee_id);
