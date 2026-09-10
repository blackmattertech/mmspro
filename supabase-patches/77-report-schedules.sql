-- QUERY NAME: 77-report-schedules — Scheduled report email delivery
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 76-pm-plan-overdue-status.sql
-- Org-admin schedules for owner reports (PDF attached via Mailjet).
-- ══════════════════════════════════════════════════════════════

create table if not exists public.report_schedules (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  report_key text not null
    check (report_key in ('daily-logs', 'open-logs', 'completed-logs', 'plant-wise', 'overdue')),
  emails text[] not null default '{}',
  frequency text not null default 'weekly'
    check (frequency in ('daily', 'weekly', 'monthly')),
  send_hour integer not null default 6
    check (send_hour >= 0 and send_hour <= 23),
  weekday integer
    check (weekday is null or (weekday >= 0 and weekday <= 6)),
  month_day integer
    check (month_day is null or (month_day >= 1 and month_day <= 31)),
  location_id uuid references public.org_locations(id) on delete set null,
  date_window text not null default 'last_7_days'
    check (date_window in ('previous_day', 'last_7_days', 'last_30_days', 'month_to_date')),
  columns jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_report_schedules_due
  on public.report_schedules (is_active, next_run_at);

create index if not exists idx_report_schedules_org_key
  on public.report_schedules (org_id, report_key);

create index if not exists idx_work_order_daily_logs_org_date
  on public.work_order_daily_logs (org_id, log_date desc);

comment on table public.report_schedules is
  'Org-admin email schedules for owner reports (PDF of selected columns)';

alter table public.report_schedules enable row level security;

drop policy if exists "Org members read report schedules" on public.report_schedules;
create policy "Org members read report schedules"
  on public.report_schedules for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert report schedules" on public.report_schedules;
create policy "Org admins insert report schedules"
  on public.report_schedules for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update report schedules" on public.report_schedules;
create policy "Org admins update report schedules"
  on public.report_schedules for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete report schedules" on public.report_schedules;
create policy "Org admins delete report schedules"
  on public.report_schedules for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
