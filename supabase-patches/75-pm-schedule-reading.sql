-- QUERY NAME: 75-pm-schedule-reading — PM schedule calendar units & reading fields
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 74-checklist-sections.sql
-- Adds calendar interval unit, reading-based fields, and whichever-comes-first
-- flag for PM plans (schedule type: calendar / reading / both).
-- ══════════════════════════════════════════════════════════════

alter table public.pm_plans
  add column if not exists calendar_unit text not null default 'month',
  add column if not exists last_reading numeric,
  add column if not exists last_service_date date,
  add column if not exists reading_interval numeric,
  add column if not exists whichever_comes_first boolean not null default true;

-- Migrate legacy schedule_type values into calendar_unit + normalized schedule_type.
update public.pm_plans
set
  calendar_unit = case schedule_type
    when 'daily' then 'day'
    when 'weekly' then 'week'
    when 'monthly' then 'month'
    when 'quarterly' then 'quarter'
    when 'half_yearly' then 'half_yearly'
    when 'yearly' then 'yearly'
    when 'calendar' then coalesce(nullif(calendar_unit, ''), 'month')
    else calendar_unit
  end,
  schedule_type = case
    when schedule_type in ('runtime', 'meter', 'shutdown', 'reading') then 'reading'
    when schedule_type = 'both' then 'both'
    when schedule_type = 'calendar' then 'calendar'
    when schedule_type in ('daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly') then 'calendar'
    else schedule_type
  end
where schedule_type is not null;

do $$
begin
  alter table public.pm_plans
    drop constraint if exists pm_plans_calendar_unit_check;
  alter table public.pm_plans
    add constraint pm_plans_calendar_unit_check
    check (calendar_unit in ('day', 'week', 'month', 'quarter', 'half_yearly', 'yearly'));
exception
  when others then null;
end $$;
