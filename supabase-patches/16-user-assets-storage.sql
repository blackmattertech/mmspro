-- QUERY NAME: 16-user-assets-storage — Private user-assets storage bucket
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Files: {user_id}/avatar.{ext}
-- RLS: users only access their own folder
-- ══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-assets',
  'user-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own assets" on storage.objects;
create policy "Users read own assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload own assets" on storage.objects;
create policy "Users upload own assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own assets" on storage.objects;
create policy "Users update own assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own assets" on storage.objects;
create policy "Users delete own assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
