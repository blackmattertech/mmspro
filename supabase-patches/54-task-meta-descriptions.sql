-- QUERY NAME: 54-task-meta-descriptions — Status/priority descriptions
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 53-task-management.sql
-- ══════════════════════════════════════════════════════════════

alter table public.task_statuses
  add column if not exists description text;

alter table public.task_priorities
  add column if not exists description text;
