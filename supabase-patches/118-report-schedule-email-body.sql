-- QUERY NAME: 118-report-schedule-email-body — Custom intro text for scheduled report emails
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 117-report-more-entity-keys.sql
-- Stores plain-text email intro; HTML is generated at preview/send time.
-- ══════════════════════════════════════════════════════════════

alter table public.report_schedules
  add column if not exists email_body_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_schedules_email_body_text_len'
  ) then
    alter table public.report_schedules
      add constraint report_schedules_email_body_text_len
      check (email_body_text is null or char_length(email_body_text) <= 8000);
  end if;
end $$;

comment on column public.report_schedules.email_body_text is
  'Optional plain-text intro for scheduled report emails; wrapped in branded HTML at send time';
