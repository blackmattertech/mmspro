-- QUERY NAME: 71-work-order-daily-logs — Per-day work logs on WOs
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 70-work-order-permit-details.sql
-- Technicians start/end each day, record work done and consumables.
-- Does not change WO status transitions.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.work_order_daily_logs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_order_id uuid references public.manual_work_orders(id) on delete cascade not null,
  log_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  day_status text not null default 'open'
    check (day_status in ('open', 'closed')),
  work_done text,
  remarks text,
  labour_count integer,
  materials jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (work_order_id, log_date)
);

create index if not exists idx_work_order_daily_logs_org_wo
  on public.work_order_daily_logs (org_id, work_order_id);

create index if not exists idx_work_order_daily_logs_wo_date
  on public.work_order_daily_logs (work_order_id, log_date desc);

create unique index if not exists idx_work_order_daily_logs_one_open
  on public.work_order_daily_logs (work_order_id)
  where day_status = 'open';

comment on table public.work_order_daily_logs is
  'Day-level work journal for multi-day work orders (start/end day, work done, materials)';

comment on column public.work_order_daily_logs.materials is
  'Array of { code, description, uom, qty } consumables for this day';

alter table public.work_order_daily_logs enable row level security;

drop policy if exists "Org members read work order daily logs" on public.work_order_daily_logs;
create policy "Org members read work order daily logs"
  on public.work_order_daily_logs for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work order daily logs" on public.work_order_daily_logs;
create policy "Org members insert work order daily logs"
  on public.work_order_daily_logs for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update work order daily logs" on public.work_order_daily_logs;
create policy "Org members update work order daily logs"
  on public.work_order_daily_logs for update
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members delete work order daily logs" on public.work_order_daily_logs;
create policy "Org members delete work order daily logs"
  on public.work_order_daily_logs for delete
  using (org_id = public.current_user_org_id());
