-- QUERY NAME: 129-support-ticket-attachments — Ticket message attachments
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 128-support-tickets.sql
-- Stores reply/create attachments on support_ticket_messages and a
-- dedicated private storage bucket (25 MB / file).
-- ══════════════════════════════════════════════════════════════

alter table public.support_ticket_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_body_len;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_body_len
  check (char_length(btrim(body)) <= 8000);

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_attachments_check;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-ticket-assets',
  'support-ticket-assets',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Org members read support ticket assets" on storage.objects;
create policy "Org members read support ticket assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-ticket-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members upload support ticket assets" on storage.objects;
create policy "Org members upload support ticket assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'support-ticket-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members update support ticket assets" on storage.objects;
create policy "Org members update support ticket assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'support-ticket-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  )
  with check (
    bucket_id = 'support-ticket-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members delete support ticket assets" on storage.objects;
create policy "Org members delete support ticket assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'support-ticket-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );
