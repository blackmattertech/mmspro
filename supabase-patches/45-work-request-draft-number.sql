-- QUERY NAME: 45-work-request-draft-number — Nullable WR number for drafts
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 44-work-requests.sql
-- ══════════════════════════════════════════════════════════════

alter table public.work_requests
  alter column request_number drop not null;
