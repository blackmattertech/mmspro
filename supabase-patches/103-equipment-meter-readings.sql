-- QUERY NAME: 103-equipment-meter-readings — Equipment meter logbook
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 102-list-status-aggregates.sql
-- Companies can require a meter reading on equipment. Those records
-- appear in Logbook. Each log stores the reading, timestamp, and user.
-- ══════════════════════════════════════════════════════════════

alter table public.equipment
  add column if not exists reading_required boolean not null default false,
  add column if not exists last_meter_reading numeric,
  add column if not exists last_meter_reading_at timestamptz,
  add column if not exists last_meter_logged_by_name text;

create index if not exists idx_equipment_org_reading_required
  on public.equipment (org_id, name)
  where reading_required = true;

create table if not exists public.equipment_meter_readings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  equipment_id uuid references public.equipment(id) on delete cascade not null,
  reading numeric not null,
  reading_at timestamptz not null default now(),
  logged_by uuid references public.profiles(id) on delete set null,
  logged_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_equipment_meter_readings_equipment_at
  on public.equipment_meter_readings (equipment_id, reading_at desc);

create index if not exists idx_equipment_meter_readings_org
  on public.equipment_meter_readings (org_id, reading_at desc);

do $$
begin
  alter table public.equipment_meter_readings
    drop constraint if exists equipment_meter_readings_reading_check;
  alter table public.equipment_meter_readings
    add constraint equipment_meter_readings_reading_check
    check (reading >= 0);
exception
  when others then null;
end $$;

alter table public.equipment_meter_readings enable row level security;

drop policy if exists "Org members read meter readings" on public.equipment_meter_readings;
create policy "Org members read meter readings"
  on public.equipment_meter_readings for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert meter readings" on public.equipment_meter_readings;
create policy "Org members insert meter readings"
  on public.equipment_meter_readings for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete meter readings" on public.equipment_meter_readings;
create policy "Org members delete meter readings"
  on public.equipment_meter_readings for delete
  using (org_id = public.current_user_org_id());

-- People who can see equipment can open Logbook and add readings.
insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  'logbook',
  (p.can_read or p.can_update),
  p.can_read,
  false,
  p.can_delete
from public.org_access_role_permissions p
where p.module_key = 'equipment'
on conflict (role_id, module_key) do nothing;
