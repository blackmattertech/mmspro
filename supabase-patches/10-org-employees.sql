-- ══════════════════════════════════════════════════════════════
-- MMS PRO — Org employees master (org-scoped)
-- Safe to re-run. Apply after 09-designation-departments.sql
-- Profile photos: org-assets/{org_id}/employees/{employee_id}.{ext}
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_employees (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  emp_id text not null,
  name text not null,
  mobile text,
  email text,
  designation_id uuid references public.designations(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  location_id uuid references public.org_locations(id) on delete set null,
  photo_url text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, emp_id)
);

create index if not exists idx_org_employees_org_id on public.org_employees(org_id);
create index if not exists idx_org_employees_department_id on public.org_employees(department_id);
create index if not exists idx_org_employees_location_id on public.org_employees(location_id);
create index if not exists idx_org_employees_designation_id on public.org_employees(designation_id);

alter table public.org_employees enable row level security;

drop policy if exists "Org members read employees" on public.org_employees;
create policy "Org members read employees"
  on public.org_employees for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert employees" on public.org_employees;
create policy "Org admins insert employees"
  on public.org_employees for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update employees" on public.org_employees;
create policy "Org admins update employees"
  on public.org_employees for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete employees" on public.org_employees;
create policy "Org admins delete employees"
  on public.org_employees for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
