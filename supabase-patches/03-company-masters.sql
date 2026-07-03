-- QUERY NAME: 03-company-masters — Company details, locations, departments
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 00-bootstrap.sql
-- ══════════════════════════════════════════════════════════════

-- 1. EXTEND ORGANIZATIONS (company profile fields)
alter table public.organizations add column if not exists email text;
alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists website text;
alter table public.organizations add column if not exists address_line1 text;
alter table public.organizations add column if not exists address_line2 text;
alter table public.organizations add column if not exists city text;
alter table public.organizations add column if not exists state text;
alter table public.organizations add column if not exists postal_code text;
alter table public.organizations add column if not exists country text;
alter table public.organizations add column if not exists tax_id text;
alter table public.organizations add column if not exists currency text default 'INR';
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations add column if not exists updated_at timestamptz default now();

-- 2. LOCATIONS
create table if not exists public.org_locations (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  code text not null,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  is_primary boolean default false not null,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, code)
);

-- 3. DEPARTMENTS
create table if not exists public.departments (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  location_id uuid references public.org_locations(id) on delete set null,
  name text not null,
  description text,
  all_locations boolean default false not null,
  parent_id uuid references public.departments(id) on delete set null,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_locations_org_id on public.org_locations(org_id);
create index if not exists idx_departments_org_id on public.departments(org_id);
create index if not exists idx_departments_location_id on public.departments(location_id);

-- 4. RLS HELPERS
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_org_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 5. ENABLE RLS
alter table public.org_locations enable row level security;
alter table public.departments enable row level security;

-- organizations: allow owners/admins to update their org
drop policy if exists "Org admins update own organization" on public.organizations;
create policy "Org admins update own organization"
  on public.organizations for update
  using (
    id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

-- org_locations policies
drop policy if exists "Org members read locations" on public.org_locations;
create policy "Org members read locations"
  on public.org_locations for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert locations" on public.org_locations;
create policy "Org admins insert locations"
  on public.org_locations for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update locations" on public.org_locations;
create policy "Org admins update locations"
  on public.org_locations for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete locations" on public.org_locations;
create policy "Org admins delete locations"
  on public.org_locations for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

-- departments policies
drop policy if exists "Org members read departments" on public.departments;
create policy "Org members read departments"
  on public.departments for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert departments" on public.departments;
create policy "Org admins insert departments"
  on public.departments for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update departments" on public.departments;
create policy "Org admins update departments"
  on public.departments for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete departments" on public.departments;
create policy "Org admins delete departments"
  on public.departments for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
