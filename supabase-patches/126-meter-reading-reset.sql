-- QUERY NAME: 126-meter-reading-reset — Cumulative meter reading across resets
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 125-wo-order-to-tabs.sql
-- Resetting a meter stores face value 0. Cumulative reading keeps
-- the closed total, and later face readings add onto that total.
-- ══════════════════════════════════════════════════════════════

alter table public.equipment
  add column if not exists meter_reading_offset numeric not null default 0;

alter table public.equipment_meter_readings
  add column if not exists is_reset boolean not null default false,
  add column if not exists cycle_offset numeric not null default 0;

do $$
begin
  alter table public.equipment
    drop constraint if exists equipment_meter_reading_offset_check;
  alter table public.equipment
    add constraint equipment_meter_reading_offset_check
    check (meter_reading_offset >= 0);
exception
  when others then null;
end $$;

do $$
begin
  alter table public.equipment_meter_readings
    drop constraint if exists equipment_meter_readings_cycle_offset_check;
  alter table public.equipment_meter_readings
    add constraint equipment_meter_readings_cycle_offset_check
    check (cycle_offset >= 0);
exception
  when others then null;
end $$;

notify pgrst, 'reload schema';
