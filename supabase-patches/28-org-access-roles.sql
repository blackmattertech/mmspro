-- QUERY NAME: 28-org-access-roles — Custom access roles and permissions
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 27-performance-indexes.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_access_roles (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  location_id uuid references public.org_locations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.org_access_roles
  add column if not exists location_id uuid references public.org_locations(id) on delete cascade;

-- Remove role icons if an earlier draft of this patch added them
alter table public.org_access_roles drop column if exists icon_url;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'org_access_roles_org_id_name_key'
  ) then
    alter table public.org_access_roles
      drop constraint org_access_roles_org_id_name_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_access_roles_org_id_location_id_name_key'
  ) then
    alter table public.org_access_roles
      add constraint org_access_roles_org_id_location_id_name_key unique (org_id, location_id, name);
  end if;
end $$;

-- Unique role names for org-wide (all-location) roles where location_id is null
create unique index if not exists org_access_roles_org_id_name_all_locations_key
  on public.org_access_roles (org_id, name)
  where location_id is null;

create table if not exists public.org_access_role_permissions (
  id uuid default gen_random_uuid() primary key,
  role_id uuid references public.org_access_roles(id) on delete cascade not null,
  module_key text not null,
  can_create boolean default false not null,
  can_read boolean default false not null,
  can_update boolean default false not null,
  can_delete boolean default false not null,
  unique (role_id, module_key)
);

create index if not exists idx_org_access_roles_org_id on public.org_access_roles(org_id);
create index if not exists idx_org_access_roles_location_id on public.org_access_roles(location_id);
create index if not exists idx_org_access_role_permissions_role_id
  on public.org_access_role_permissions(role_id);

alter table public.org_employees
  add column if not exists access_role_id uuid references public.org_access_roles(id) on delete set null;

create index if not exists idx_org_employees_access_role_id on public.org_employees(access_role_id);

alter table public.org_access_roles enable row level security;
alter table public.org_access_role_permissions enable row level security;

drop policy if exists "Org members read access roles" on public.org_access_roles;
create policy "Org members read access roles"
  on public.org_access_roles for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert access roles" on public.org_access_roles;
create policy "Org admins insert access roles"
  on public.org_access_roles for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update access roles" on public.org_access_roles;
create policy "Org admins update access roles"
  on public.org_access_roles for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete access roles" on public.org_access_roles;
create policy "Org admins delete access roles"
  on public.org_access_roles for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org members read role permissions" on public.org_access_role_permissions;
create policy "Org members read role permissions"
  on public.org_access_role_permissions for select
  using (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id and r.org_id = public.current_user_org_id()
    )
  );

drop policy if exists "Org admins insert role permissions" on public.org_access_role_permissions;
create policy "Org admins insert role permissions"
  on public.org_access_role_permissions for insert
  with check (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_org_role() in ('owner', 'admin')
    )
  );

drop policy if exists "Org admins update role permissions" on public.org_access_role_permissions;
create policy "Org admins update role permissions"
  on public.org_access_role_permissions for update
  using (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_org_role() in ('owner', 'admin')
    )
  );

drop policy if exists "Org admins delete role permissions" on public.org_access_role_permissions;
create policy "Org admins delete role permissions"
  on public.org_access_role_permissions for delete
  using (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_org_role() in ('owner', 'admin')
    )
  );
