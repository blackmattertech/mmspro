-- QUERY NAME: 17-asset-fields — Asset form field definitions (section / parent / child)
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 16-user-assets-storage.sql
-- Hierarchy: Section → Parent field → Child field
-- ══════════════════════════════════════════════════════════════

create table if not exists public.asset_fields (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  kind text not null check (kind in ('section', 'parent', 'child')),
  section_id uuid references public.asset_fields(id) on delete cascade,
  parent_id uuid references public.asset_fields(id) on delete cascade,
  field_type text check (
    field_type is null
    or field_type in (
      'text', 'textarea', 'number', 'date', 'datetime',
      'image', 'file', 'checkbox', 'dropdown'
    )
  ),
  sort_order int default 0 not null,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint asset_fields_section_kind check (
    kind <> 'section' or (section_id is null and parent_id is null and field_type is null)
  ),
  constraint asset_fields_parent_kind check (
    kind <> 'parent' or (section_id is not null and parent_id is null and field_type is not null)
  ),
  constraint asset_fields_child_kind check (
    kind <> 'child' or (parent_id is not null and field_type is not null)
  )
);

create index if not exists idx_asset_fields_org_id on public.asset_fields(org_id);
create index if not exists idx_asset_fields_section_id on public.asset_fields(section_id);
create index if not exists idx_asset_fields_parent_id on public.asset_fields(parent_id);
create index if not exists idx_asset_fields_kind on public.asset_fields(kind);

alter table public.asset_fields enable row level security;

drop policy if exists "Org members read asset fields" on public.asset_fields;
create policy "Org members read asset fields"
  on public.asset_fields for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert asset fields" on public.asset_fields;
create policy "Org admins insert asset fields"
  on public.asset_fields for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update asset fields" on public.asset_fields;
create policy "Org admins update asset fields"
  on public.asset_fields for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete asset fields" on public.asset_fields;
create policy "Org admins delete asset fields"
  on public.asset_fields for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
