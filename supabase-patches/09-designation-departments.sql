-- QUERY NAME: 09-designation-departments — Map designations to departments
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 08-designations.sql
-- ══════════════════════════════════════════════════════════════

alter table public.designations
  add column if not exists all_departments boolean default true not null;

create table if not exists public.designation_departments (
  designation_id uuid references public.designations(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  primary key (designation_id, department_id)
);

create index if not exists idx_designation_departments_department_id
  on public.designation_departments(department_id);

alter table public.designation_departments enable row level security;

drop policy if exists "Org members read designation departments" on public.designation_departments;
create policy "Org members read designation departments"
  on public.designation_departments for select
  using (
    exists (
      select 1 from public.designations d
      where d.id = designation_id
        and d.org_id = public.current_user_org_id()
    )
  );

drop policy if exists "Org admins insert designation departments" on public.designation_departments;
create policy "Org admins insert designation departments"
  on public.designation_departments for insert
  with check (
    exists (
      select 1 from public.designations d
      where d.id = designation_id
        and d.org_id = public.current_user_org_id()
        and public.current_user_org_role() in ('owner', 'admin')
    )
  );

drop policy if exists "Org admins delete designation departments" on public.designation_departments;
create policy "Org admins delete designation departments"
  on public.designation_departments for delete
  using (
    exists (
      select 1 from public.designations d
      where d.id = designation_id
        and d.org_id = public.current_user_org_id()
        and public.current_user_org_role() in ('owner', 'admin')
    )
  );
