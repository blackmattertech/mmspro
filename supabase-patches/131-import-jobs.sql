-- QUERY NAME: 131-import-jobs — Background Excel import job tracking + storage
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 130-report-ready-reports.sql
-- Durable status for BullMQ-backed bulk imports. Service role writes;
-- org members can read their own jobs.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.import_jobs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  template_key text not null,
  file_name text not null default 'import.xlsx',
  status text not null default 'queued'
    check (status in ('queued', 'active', 'completed', 'failed')),
  context jsonb not null default '{}'::jsonb,
  result_json jsonb,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  error text,
  source_path text,
  failed_path text,
  failed_filename text,
  bullmq_job_id text,
  created_at timestamptz default now() not null,
  started_at timestamptz,
  finished_at timestamptz,
  constraint import_jobs_file_name_check check (char_length(btrim(file_name)) between 1 and 255),
  constraint import_jobs_template_key_check check (char_length(btrim(template_key)) between 1 and 80),
  constraint import_jobs_counts_check check (
    created_count >= 0
    and updated_count >= 0
    and failed_count >= 0
    and skipped_count >= 0
  )
);

create index if not exists idx_import_jobs_org_created
  on public.import_jobs (org_id, created_at desc);

create index if not exists idx_import_jobs_org_user_created
  on public.import_jobs (org_id, user_id, created_at desc);

create index if not exists idx_import_jobs_org_status
  on public.import_jobs (org_id, status);

comment on table public.import_jobs is
  'Background Excel bulk-import jobs (BullMQ); source/failed files in import-job-assets';

alter table public.import_jobs enable row level security;

drop policy if exists "Org members read own import jobs" on public.import_jobs;
create policy "Org members read own import jobs"
  on public.import_jobs for select
  using (
    org_id = public.current_user_org_id()
    and (
      user_id = auth.uid()
      or public.current_user_org_role() in ('owner', 'admin')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'import-job-assets',
  'import-job-assets',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Org members read import job assets" on storage.objects;
create policy "Org members read import job assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'import-job-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );
