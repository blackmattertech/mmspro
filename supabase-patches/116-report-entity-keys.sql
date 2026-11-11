-- QUERY NAME: 116-report-entity-keys — Work request + PM report keys
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 115-org-table-column-defaults.sql
-- Adds interactive report keys for work requests and PM plans.
-- Existing keys remain valid for saved customs and schedules.
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
    'pm-plans'
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
    'pm-plans'
  ));
