-- QUERY NAME: 79-report-custom-reports — Named custom reports
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 78-department-code.sql
-- Org-saved custom reports (columns + plant). Schedules and PDF download
-- both run from the same saved report.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.report_custom_reports (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  report_key text not null
    check (report_key in ('daily-logs', 'open-logs', 'completed-logs', 'plant-wise', 'overdue')),
  columns jsonb not null default '[]'::jsonb,
  location_id uuid references public.org_locations(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint report_custom_reports_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint report_custom_reports_org_key_name_key unique (org_id, report_key, name)
);

create index if not exists idx_report_custom_reports_org_key
  on public.report_custom_reports (org_id, report_key);

comment on table public.report_custom_reports is
  'Named column + plant configs shared by report preview, PDF download, and email schedules';

alter table public.report_custom_reports enable row level security;

drop policy if exists "Org members read custom reports" on public.report_custom_reports;
create policy "Org members read custom reports"
  on public.report_custom_reports for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert custom reports" on public.report_custom_reports;
create policy "Org admins insert custom reports"
  on public.report_custom_reports for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins update custom reports" on public.report_custom_reports;
create policy "Org admins update custom reports"
  on public.report_custom_reports for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete custom reports" on public.report_custom_reports;
create policy "Org admins delete custom reports"
  on public.report_custom_reports for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

alter table public.report_schedules
  add column if not exists custom_report_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_schedules_custom_report_id_fkey'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_custom_report_id_fkey
      foreign key (custom_report_id)
      references public.report_custom_reports(id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_report_schedules_custom_report
  on public.report_schedules (custom_report_id)
  where custom_report_id is not null;
