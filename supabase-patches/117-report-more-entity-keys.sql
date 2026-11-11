-- QUERY NAME: 117-report-more-entity-keys — Extra interactive report keys
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 116-report-entity-keys.sql
-- Adds meter reading, tasks, warranties, and assets report keys.
-- ══════════════════════════════════════════════════════════════

alter table public.report_custom_reports
  drop constraint if exists report_custom_reports_report_key_check;

alter table public.report_custom_reports
  add constraint report_custom_reports_report_key_check
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
  ));

alter table public.report_schedules
  drop constraint if exists report_schedules_report_key_check;

alter table public.report_schedules
  add constraint report_schedules_report_key_check
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
  ));
