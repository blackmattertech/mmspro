-- QUERY NAME: 07-department-all-locations — Department all-locations flag
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 06-drop-department-code.sql
-- ══════════════════════════════════════════════════════════════

-- Department can apply to all org locations (not a single site)
alter table public.departments
  add column if not exists all_locations boolean default false not null;
