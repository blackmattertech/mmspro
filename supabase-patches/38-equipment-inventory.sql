-- QUERY NAME: 38-equipment-inventory — Areas, equipment, dynamic equipment fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 37-work-order-assignment-cascade.sql
-- Hierarchy: Location → Department → Area → Equipment
-- Schema: equipment_fields (section/parent/child) + equipment_values
-- ══════════════════════════════════════════════════════════════

-- 1. AREAS
create table if not exists public.areas (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  location_id uuid references public.org_locations(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  name text not null,
  code text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_areas_org_code
  on public.areas (org_id, code)
  where code is not null and code <> '';

create index if not exists idx_areas_org_id on public.areas(org_id);
create index if not exists idx_areas_location_id on public.areas(location_id);
create index if not exists idx_areas_department_id on public.areas(department_id);

alter table public.areas enable row level security;

drop policy if exists "Org members read areas" on public.areas;
create policy "Org members read areas"
  on public.areas for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org managers insert areas" on public.areas;
create policy "Org managers insert areas"
  on public.areas for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers update areas" on public.areas;
create policy "Org managers update areas"
  on public.areas for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers delete areas" on public.areas;
create policy "Org managers delete areas"
  on public.areas for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- 2. EQUIPMENT FIELD SCHEMA (mirrors asset_fields)
create table if not exists public.equipment_fields (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  kind text not null check (kind in ('section', 'parent', 'child')),
  section_id uuid references public.equipment_fields(id) on delete cascade,
  parent_id uuid references public.equipment_fields(id) on delete cascade,
  field_type text check (
    field_type is null
    or field_type in (
      'text', 'textarea', 'number', 'date', 'datetime',
      'image', 'file', 'checkbox', 'dropdown'
    )
  ),
  sort_order int default 0 not null,
  is_active boolean default true not null,
  depends_on_parent_id uuid references public.equipment_fields(id) on delete set null,
  depends_on_option text,
  icon_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint equipment_fields_section_kind check (
    kind <> 'section' or (section_id is null and parent_id is null and field_type is null)
  ),
  constraint equipment_fields_parent_kind check (
    kind <> 'parent' or (section_id is not null and parent_id is null and field_type is not null)
  ),
  constraint equipment_fields_child_kind check (
    kind <> 'child' or (parent_id is not null and field_type is not null)
  )
);

create index if not exists idx_equipment_fields_org_id on public.equipment_fields(org_id);
create index if not exists idx_equipment_fields_section_id on public.equipment_fields(section_id);
create index if not exists idx_equipment_fields_parent_id on public.equipment_fields(parent_id);
create index if not exists idx_equipment_fields_kind on public.equipment_fields(kind);

alter table public.equipment_fields enable row level security;

drop policy if exists "Org members read equipment fields" on public.equipment_fields;
create policy "Org members read equipment fields"
  on public.equipment_fields for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org managers insert equipment fields" on public.equipment_fields;
create policy "Org managers insert equipment fields"
  on public.equipment_fields for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers update equipment fields" on public.equipment_fields;
create policy "Org managers update equipment fields"
  on public.equipment_fields for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers delete equipment fields" on public.equipment_fields;
create policy "Org managers delete equipment fields"
  on public.equipment_fields for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- 3. EQUIPMENT RECORDS
create table if not exists public.equipment (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  location_id uuid references public.org_locations(id) on delete restrict not null,
  department_id uuid references public.departments(id) on delete restrict not null,
  area_id uuid references public.areas(id) on delete restrict not null,
  name text not null,
  code text not null,
  qr_code text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, code)
);

create unique index if not exists idx_equipment_org_qr
  on public.equipment (org_id, qr_code)
  where qr_code is not null and qr_code <> '';

create index if not exists idx_equipment_org_id on public.equipment(org_id);
create index if not exists idx_equipment_location_id on public.equipment(location_id);
create index if not exists idx_equipment_department_id on public.equipment(department_id);
create index if not exists idx_equipment_area_id on public.equipment(area_id);

alter table public.equipment enable row level security;

drop policy if exists "Org members read equipment" on public.equipment;
create policy "Org members read equipment"
  on public.equipment for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org managers insert equipment" on public.equipment;
create policy "Org managers insert equipment"
  on public.equipment for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers update equipment" on public.equipment;
create policy "Org managers update equipment"
  on public.equipment for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers delete equipment" on public.equipment;
create policy "Org managers delete equipment"
  on public.equipment for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- 4. EQUIPMENT DYNAMIC VALUES
create table if not exists public.equipment_values (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  equipment_id uuid references public.equipment(id) on delete cascade not null,
  field_id uuid references public.equipment_fields(id) on delete cascade not null,
  value_text text,
  value_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (equipment_id, field_id)
);

create index if not exists idx_equipment_values_equipment on public.equipment_values(equipment_id);
create index if not exists idx_equipment_values_field on public.equipment_values(field_id);
create index if not exists idx_equipment_values_org on public.equipment_values(org_id);

alter table public.equipment_values enable row level security;

drop policy if exists "Org members read equipment values" on public.equipment_values;
create policy "Org members read equipment values"
  on public.equipment_values for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org managers insert equipment values" on public.equipment_values;
create policy "Org managers insert equipment values"
  on public.equipment_values for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers update equipment values" on public.equipment_values;
create policy "Org managers update equipment values"
  on public.equipment_values for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org managers delete equipment values" on public.equipment_values;
create policy "Org managers delete equipment values"
  on public.equipment_values for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );
