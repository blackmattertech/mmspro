-- QUERY NAME: 133-import-job-progress — Row progress for background imports
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 131-import-jobs.sql
-- ══════════════════════════════════════════════════════════════

alter table public.import_jobs
  add column if not exists progress_done integer not null default 0,
  add column if not exists progress_total integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'import_jobs_progress_done_check'
  ) then
    alter table public.import_jobs
      add constraint import_jobs_progress_done_check check (progress_done >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'import_jobs_progress_total_check'
  ) then
    alter table public.import_jobs
      add constraint import_jobs_progress_total_check check (progress_total >= 0);
  end if;
end $$;
