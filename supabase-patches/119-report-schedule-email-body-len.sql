-- QUERY NAME: 119-report-schedule-email-body-len — Allow longer custom schedule email bodies
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 118-report-schedule-email-body.sql
-- ══════════════════════════════════════════════════════════════

alter table public.report_schedules
  drop constraint if exists report_schedules_email_body_text_len;

alter table public.report_schedules
  add constraint report_schedules_email_body_text_len
  check (email_body_text is null or char_length(email_body_text) <= 8000);
