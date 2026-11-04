-- QUERY NAME: 113-meter-logger-profile — Profile id on the latest meter reading
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 112-work-order-daily-field-snapshots.sql
-- Keeps the logger profile on the asset so logbook rows can show that person's photo.
-- ══════════════════════════════════════════════════════════════

alter table public.equipment
  add column if not exists last_meter_logged_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_last_meter_logged_by_fkey'
  ) then
    alter table public.equipment
      add constraint equipment_last_meter_logged_by_fkey
      foreign key (last_meter_logged_by) references public.profiles(id) on delete set null;
  end if;
end $$;

update public.equipment as equipment
set last_meter_logged_by = latest.logged_by
from (
  select distinct on (equipment_id)
    equipment_id,
    logged_by
  from public.equipment_meter_readings
  where logged_by is not null
  order by equipment_id, reading_at desc
) as latest
where equipment.id = latest.equipment_id
  and equipment.last_meter_logged_by is distinct from latest.logged_by;

notify pgrst, 'reload schema';
