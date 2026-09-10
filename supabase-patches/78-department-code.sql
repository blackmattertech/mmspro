-- QUERY NAME: 78-department-code — Restore departments.code
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 77-report-schedules.sql
-- Production DBs that applied 06-drop-department-code but not 13 are missing
-- this column. Session and department embeds must not require it until applied.
-- ══════════════════════════════════════════════════════════════

alter table public.departments
  add column if not exists code text;

update public.departments
set code = upper(substr(replace(id::text, '-', ''), 1, 8))
where code is null or trim(code) = '';

create unique index if not exists idx_departments_org_id_code
  on public.departments (org_id, code)
  where code is not null;
