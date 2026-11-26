-- QUERY NAME: 138-warranty-item-equipment — Linked asset + reminder schedule on warranty items
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 137-scwo-prefix-scheduled-work-orders.sql
-- Adds per-line equipment link and Task/PM-style expiry reminder cursor fields.
-- Keeps expiry_notification_days as lead days (compat).
-- ══════════════════════════════════════════════════════════════

alter table public.warranties
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_warranties_created_by
  on public.warranties(org_id, created_by_profile_id)
  where created_by_profile_id is not null;

alter table public.warranty_items
  add column if not exists equipment_id uuid references public.equipment(id) on delete set null,
  add column if not exists asset_hierarchy jsonb default '[]'::jsonb not null,
  add column if not exists reminder_mode text not null default 'one_time',
  add column if not exists reminder_frequency text null,
  add column if not exists reminder_next_at date null,
  add column if not exists reminder_last_sent_on date null;

-- Guard reminder_mode / frequency values for new writes (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'warranty_items_reminder_mode_check'
  ) then
    alter table public.warranty_items
      add constraint warranty_items_reminder_mode_check
      check (reminder_mode in ('one_time', 'recurring'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'warranty_items_reminder_frequency_check'
  ) then
    alter table public.warranty_items
      add constraint warranty_items_reminder_frequency_check
      check (
        reminder_frequency is null
        or reminder_frequency in ('daily', 'weekly', 'monthly', 'custom')
      );
  end if;
end $$;

create index if not exists idx_warranty_items_equipment
  on public.warranty_items(org_id, equipment_id)
  where equipment_id is not null;

create index if not exists idx_warranty_items_reminder_due
  on public.warranty_items(org_id, reminder_next_at, warranty_end)
  where warranty_end is not null;
