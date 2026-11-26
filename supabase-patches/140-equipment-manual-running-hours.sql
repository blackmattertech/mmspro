-- QUERY NAME: 140-equipment-manual-running-hours — Manual period running hours for reliability
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 139-warranty-reminder-custom.sql
-- Non-metered equipment can store period running hours for the
-- Reliability Calculator. Metered assets keep using Logbook readings.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.equipment_manual_running_hours (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  hours numeric not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_manual_running_hours_period_check
    check (period_end >= period_start),
  constraint equipment_manual_running_hours_hours_check
    check (hours >= 0)
);

create index if not exists idx_equipment_manual_hours_equipment_period
  on public.equipment_manual_running_hours (org_id, equipment_id, period_start, period_end);

create index if not exists idx_equipment_manual_hours_org_period
  on public.equipment_manual_running_hours (org_id, period_start, period_end);

alter table public.equipment_manual_running_hours enable row level security;

drop policy if exists "Org members read manual running hours" on public.equipment_manual_running_hours;
create policy "Org members read manual running hours"
  on public.equipment_manual_running_hours for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert manual running hours" on public.equipment_manual_running_hours;
create policy "Org members insert manual running hours"
  on public.equipment_manual_running_hours for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update manual running hours" on public.equipment_manual_running_hours;
create policy "Org members update manual running hours"
  on public.equipment_manual_running_hours for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete manual running hours" on public.equipment_manual_running_hours;
create policy "Org members delete manual running hours"
  on public.equipment_manual_running_hours for delete
  using (org_id = public.current_user_org_id());

comment on table public.equipment_manual_running_hours is
  'Period running hours for non-metered equipment used by the Reliability Calculator.';

-- Boundary cumulative meter reading at-or-before a timestamp (batched).
create or replace function public.reliability_meter_cumulative_at(
  p_org_id uuid,
  p_equipment_ids uuid[],
  p_at timestamptz
)
returns table (equipment_id uuid, cumulative_reading numeric)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (r.equipment_id)
    r.equipment_id,
    round((coalesce(r.cycle_offset, 0) + r.reading)::numeric, 6) as cumulative_reading
  from public.equipment_meter_readings r
  where r.org_id = p_org_id
    and r.equipment_id = any (p_equipment_ids)
    and r.reading_at <= p_at
  order by r.equipment_id, r.reading_at desc, r.created_at desc, r.id desc;
$$;

revoke all on function public.reliability_meter_cumulative_at(uuid, uuid[], timestamptz) from public;
grant execute on function public.reliability_meter_cumulative_at(uuid, uuid[], timestamptz) to authenticated;
grant execute on function public.reliability_meter_cumulative_at(uuid, uuid[], timestamptz) to service_role;
