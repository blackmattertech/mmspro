-- QUERY NAME: 132-support-rich-text-storage — Rich text storage limits
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 129-support-ticket-attachments.sql
-- TipTap HTML for ticket description/body is longer than visible text.
-- Visible length (10–8000 / 1–8000) stays enforced in shared validators;
-- DB only caps raw storage size.
-- ══════════════════════════════════════════════════════════════

alter table public.support_tickets
  drop constraint if exists support_tickets_description_len;

alter table public.support_tickets
  add constraint support_tickets_description_len
  check (
    char_length(btrim(description)) between 1 and 50000
  );

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_body_len;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_body_len
  check (char_length(btrim(body)) <= 50000);
