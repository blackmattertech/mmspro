-- QUERY NAME: 14-department-location-heads — Per-location department heads
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 13-managers-department-heads-codes.sql
-- ══════════════════════════════════════════════════════════════

alter table public.departments
  add column if not exists per_location_heads boolean not null default false;

create table if not exists public.department_location_heads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  location_id uuid not null references public.org_locations(id) on delete cascade,
  head_employee_id uuid references public.org_employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, location_id)
);

create index if not exists idx_department_location_heads_department_id
  on public.department_location_heads(department_id);

create index if not exists idx_department_location_heads_location_id
  on public.department_location_heads(location_id);

alter table public.department_location_heads enable row level security;

drop policy if exists "Org members read department location heads" on public.department_location_heads;
create policy "Org members read department location heads"
  on public.department_location_heads for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert department location heads" on public.department_location_heads;
create policy "Org admins insert department location heads"
  on public.department_location_heads for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update department location heads" on public.department_location_heads;
create policy "Org admins update department location heads"
  on public.department_location_heads for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete department location heads" on public.department_location_heads;
create policy "Org admins delete department location heads"
  on public.department_location_heads for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
