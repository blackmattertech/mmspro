-- QUERY NAME: 12-employee-emails — Additional employee emails
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 11-employee-login.sql
-- Primary email stays on org_employees.email (login email)
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_employee_emails (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  employee_id uuid references public.org_employees(id) on delete cascade not null,
  email text not null,
  created_at timestamptz default now(),
  unique (employee_id, email),
  unique (org_id, email)
);

create index if not exists idx_org_employee_emails_employee_id
  on public.org_employee_emails(employee_id);

create index if not exists idx_org_employee_emails_org_id
  on public.org_employee_emails(org_id);

alter table public.org_employee_emails enable row level security;

drop policy if exists "Org members read employee emails" on public.org_employee_emails;
create policy "Org members read employee emails"
  on public.org_employee_emails for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert employee emails" on public.org_employee_emails;
create policy "Org admins insert employee emails"
  on public.org_employee_emails for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete employee emails" on public.org_employee_emails;
create policy "Org admins delete employee emails"
  on public.org_employee_emails for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
