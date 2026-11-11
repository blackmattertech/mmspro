-- QUERY NAME: 82-report-logs-key — Unified logs report key
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 81-org-text-field-limits.sql
-- Adds `logs` as the single interactive report type. Existing keys remain
-- valid so previously saved custom reports and schedules keep working.
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
    'logs'
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
    'logs'
  ));
