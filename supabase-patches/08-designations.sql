-- QUERY NAME: 08-designations — Designations master (hierarchy 1..n)
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 07-department-all-locations.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists public.designations (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  description text,
  hierarchy integer,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.designations add column if not exists description text;
alter table public.designations add column if not exists hierarchy integer;
alter table public.designations add column if not exists is_active boolean default true not null;
alter table public.designations add column if not exists created_at timestamptz default now();
alter table public.designations add column if not exists updated_at timestamptz default now();

alter table public.designations alter column hierarchy set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'designations_org_id_name_key'
  ) then
    alter table public.designations add constraint designations_org_id_name_key unique (org_id, name);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'designations_org_id_hierarchy_key'
  ) then
    alter table public.designations add constraint designations_org_id_hierarchy_key unique (org_id, hierarchy);
  end if;
end $$;

with ranked as (
  select
    id,
    row_number() over (partition by org_id order by created_at, name) as rn
  from public.designations
  where hierarchy is null
)
update public.designations d
set hierarchy = ranked.rn
from ranked
where d.id = ranked.id;

create index if not exists idx_designations_org_id on public.designations(org_id);
create index if not exists idx_designations_org_hierarchy on public.designations(org_id, hierarchy);

alter table public.designations enable row level security;

drop policy if exists "Org members read designations" on public.designations;
create policy "Org members read designations"
  on public.designations for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert designations" on public.designations;
create policy "Org admins insert designations"
  on public.designations for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update designations" on public.designations;
create policy "Org admins update designations"
  on public.designations for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete designations" on public.designations;
create policy "Org admins delete designations"
  on public.designations for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
