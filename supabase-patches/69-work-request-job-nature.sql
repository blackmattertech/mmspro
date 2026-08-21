-- QUERY NAME: 69-work-request-job-nature — Job nature on work requests
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 68-work-centers.sql
-- Stores the selected Job Nature (options come from Assets field
-- "Job Natures" / "Job Nature"). Replaces the Breakdown Yes/No UX;
-- is_breakdown remains derived when the selected nature is Breakdown.
-- ══════════════════════════════════════════════════════════════

alter table public.work_requests
  add column if not exists job_nature text;

comment on column public.work_requests.job_nature is
  'Selected job nature label from Assets Job Natures dropdown options';
