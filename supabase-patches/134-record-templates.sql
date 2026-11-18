-- QUERY NAME: 134-record-templates — Org-shared record templates
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 133-import-job-progress.sql
-- Named reusable create drafts for WR, Manual WO, PM plans, and Tasks.
-- Attachment bytes are snapshotted into the private record-templates bucket.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.record_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_key text not null,
  name text not null,
  source_record_id uuid,
  payload jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint record_templates_module_key_check check (
    module_key in (
      'work_request',
      'work_orders_manual',
      'work_orders_scheduled',
      'tasks_followups'
    )
  ),
  constraint record_templates_name_len check (
    char_length(btrim(name)) between 3 and 120
  ),
  constraint record_templates_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint record_templates_attachments_array check (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) <= 40
  )
);

create unique index if not exists record_templates_org_module_name_uidx
  on public.record_templates (org_id, module_key, lower(btrim(name)));

create index if not exists idx_record_templates_org_module_updated
  on public.record_templates (org_id, module_key, updated_at desc);

alter table public.record_templates enable row level security;

drop policy if exists "Org members read record templates" on public.record_templates;
create policy "Org members read record templates"
  on public.record_templates for select
  to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
  );

-- Writes go through the API service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'record-templates',
  'record-templates',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'video/mp4', 'video/webm', 'video/quicktime',
    'text/plain', 'text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Org members read record template assets" on storage.objects;
create policy "Org members read record template assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'record-templates'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members upload record template assets" on storage.objects;
create policy "Org members upload record template assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'record-templates'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members update record template assets" on storage.objects;
create policy "Org members update record template assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'record-templates'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  )
  with check (
    bucket_id = 'record-templates'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members delete record template assets" on storage.objects;
create policy "Org members delete record template assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'record-templates'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );
