-- QUERY NAME: 68-work-centers — Work center master
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 67-department-head-approval.sql
-- Org work centers for Company → Work Center and Roles & Access.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.work_centers (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  location_id uuid references public.org_locations(id) on delete set null,
  name text not null,
  code text,
  description text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_work_centers_org_code
  on public.work_centers (org_id, code)
  where code is not null and code <> '';

create index if not exists idx_work_centers_org_id on public.work_centers(org_id);
create index if not exists idx_work_centers_location_id on public.work_centers(location_id);

alter table public.work_centers enable row level security;

drop policy if exists "Org members read work centers" on public.work_centers;
create policy "Org members read work centers"
  on public.work_centers for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work centers" on public.work_centers;
create policy "Org members insert work centers"
  on public.work_centers for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update work centers" on public.work_centers;
create policy "Org members update work centers"
  on public.work_centers for update
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members delete work centers" on public.work_centers;
create policy "Org members delete work centers"
  on public.work_centers for delete
  using (org_id = public.current_user_org_id());

insert into public.work_centers (org_id, name, code, description)
select o.id, 'General', 'GEN', 'Default work center'
from public.organizations o
where not exists (
  select 1
  from public.work_centers w
  where w.org_id = o.id
    and w.code = 'GEN'
);

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select r.id, 'work_centers', true, true, true, true
from public.org_access_roles r
where r.location_id is null
  and lower(btrim(r.name)) in ('location head', 'department head')
  and not exists (
    select 1
    from public.org_access_role_permissions p
    where p.role_id = r.id
      and p.module_key = 'work_centers'
  );
