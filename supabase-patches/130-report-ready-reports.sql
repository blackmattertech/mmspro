-- QUERY NAME: 130-report-ready-reports — Explicitly generated ready report artifacts
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 129-support-ticket-attachments.sql
-- Stores PDF/CSV artifacts created when a user clicks Generate in Report Builder.
-- Casual downloads and scheduled emails are not stored here.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.report_ready_reports (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  created_by uuid references public.profiles(id) on delete set null,
  report_key text not null
    check (report_key in (
      'daily-logs',
      'open-logs',
      'completed-logs',
      'plant-wise',
      'overdue',
      'logs',
      'work-requests',
      'pm-plans',
      'meter-readings',
      'tasks',
      'warranties',
      'equipment'
    )),
  custom_report_id uuid references public.report_custom_reports(id) on delete set null,
  name text not null,
  date_from date,
  date_to date,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  truncated boolean not null default false,
  pdf_path text not null,
  csv_path text not null,
  pdf_filename text not null,
  csv_filename text not null,
  byte_size bigint not null default 0,
  created_at timestamptz default now() not null,
  constraint report_ready_reports_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint report_ready_reports_row_count_check check (row_count >= 0),
  constraint report_ready_reports_byte_size_check check (byte_size >= 0)
);

create index if not exists idx_report_ready_reports_org_created
  on public.report_ready_reports (org_id, created_at desc);

create index if not exists idx_report_ready_reports_org_key
  on public.report_ready_reports (org_id, report_key);

comment on table public.report_ready_reports is
  'Explicitly generated report PDF/CSV artifacts for the Ready Reports inbox';

alter table public.report_ready_reports enable row level security;

drop policy if exists "Org members read ready reports" on public.report_ready_reports;
create policy "Org members read ready reports"
  on public.report_ready_reports for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert ready reports" on public.report_ready_reports;
create policy "Org members insert ready reports"
  on public.report_ready_reports for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete own ready reports" on public.report_ready_reports;
create policy "Org members delete own ready reports"
  on public.report_ready_reports for delete
  using (
    org_id = public.current_user_org_id()
    and (
      created_by = auth.uid()
      or public.current_user_org_role() in ('owner', 'admin')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-ready-assets',
  'report-ready-assets',
  false,
  52428800,
  array[
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Org members read report ready assets" on storage.objects;
create policy "Org members read report ready assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-ready-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members upload report ready assets" on storage.objects;
create policy "Org members upload report ready assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-ready-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members update report ready assets" on storage.objects;
create policy "Org members update report ready assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-ready-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  )
  with check (
    bucket_id = 'report-ready-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members delete report ready assets" on storage.objects;
create policy "Org members delete report ready assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-ready-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );
