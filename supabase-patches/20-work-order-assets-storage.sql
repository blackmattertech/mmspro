-- QUERY NAME: 20-work-order-assets-storage — Work order file/image storage bucket
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 19-manual-work-orders.sql
-- Files: {org_id}/{work_order_id}/{field_id}/{uuid}-{filename}
-- RLS: org members read/write in their org folder
-- ══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-order-assets',
  'work-order-assets',
  false,
  10485760,
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

drop policy if exists "Org members read work order assets" on storage.objects;
create policy "Org members read work order assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'work-order-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members upload work order assets" on storage.objects;
create policy "Org members upload work order assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'work-order-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members update work order assets" on storage.objects;
create policy "Org members update work order assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'work-order-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  )
  with check (
    bucket_id = 'work-order-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Org members delete work order assets" on storage.objects;
create policy "Org members delete work order assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'work-order-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );
