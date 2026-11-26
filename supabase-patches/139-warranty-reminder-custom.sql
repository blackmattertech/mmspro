-- QUERY NAME: 139-warranty-reminder-custom — Custom warranty reminder cadence
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 138-warranty-item-equipment.sql
-- Allows Task-style custom recurrence: every N days/weeks/months, and
-- weekday picks for weekly (e.g. every Monday).
-- ══════════════════════════════════════════════════════════════

alter table public.warranty_items
  add column if not exists reminder_interval integer null,
  add column if not exists reminder_unit text null,
  add column if not exists reminder_weekdays jsonb not null default '[]'::jsonb;

alter table public.warranty_items
  drop constraint if exists warranty_items_reminder_frequency_check;

alter table public.warranty_items
  add constraint warranty_items_reminder_frequency_check
  check (
    reminder_frequency is null
    or reminder_frequency in ('daily', 'weekly', 'monthly', 'custom')
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'warranty_items_reminder_unit_check'
  ) then
    alter table public.warranty_items
      add constraint warranty_items_reminder_unit_check
      check (
        reminder_unit is null
        or reminder_unit in ('days', 'weeks', 'months')
      );
  end if;
end $$;

comment on column public.warranty_items.reminder_interval is
  'Custom cadence count when reminder_frequency = custom (every N units).';
comment on column public.warranty_items.reminder_unit is
  'Custom cadence unit: days | weeks | months.';
comment on column public.warranty_items.reminder_weekdays is
  'JS weekday numbers 0-6 for weekly reminders (e.g. [1] = Monday).';
