-- QUERY NAME: 80-report-schedule-frequencies — Extra report schedule frequencies
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 79-report-custom-reports.sql
-- Adds twice-daily, interval, bi-weekly, twice-weekly, quarterly, half-yearly,
-- and yearly report email schedules.
-- ══════════════════════════════════════════════════════════════

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'report_schedules'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%frequency%'
  loop
    execute format('alter table public.report_schedules drop constraint if exists %I', rec.conname);
  end loop;
end $$;

alter table public.report_schedules
  add column if not exists send_hour_2 integer;

alter table public.report_schedules
  add column if not exists weekday_2 integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'report_schedules_send_hour_2_check'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_send_hour_2_check
      check (send_hour_2 is null or (send_hour_2 >= 0 and send_hour_2 <= 23));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'report_schedules_weekday_2_check'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_weekday_2_check
      check (weekday_2 is null or (weekday_2 >= 0 and weekday_2 <= 6));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'report_schedules_frequency_check'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_frequency_check
      check (frequency in (
        'daily',
        'twice_daily',
        'every_2_days',
        'every_3_days',
        'weekly',
        'twice_weekly',
        'biweekly',
        'monthly',
        'quarterly',
        'half_yearly',
        'yearly'
      ));
  end if;
end $$;
