-- QUERY NAME: 04-org-assets-storage — Private org-assets storage bucket
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Files: {org_id}/logo.{ext}
-- RLS: users only access their own org folder
-- ══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-assets',
  'org-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- SELECT: any org member can read files in their org folder
drop policy if exists "Org members read own assets" on storage.objects;
create policy "Org members read own assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
  );

-- INSERT: owners/admins only, into their org folder
drop policy if exists "Org admins upload own assets" on storage.objects;
create policy "Org admins upload own assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );

-- UPDATE: owners/admins only (upsert overwrite)
drop policy if exists "Org admins update own assets" on storage.objects;
create policy "Org admins update own assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  )
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );

-- DELETE: owners/admins only
drop policy if exists "Org admins delete own assets" on storage.objects;
create policy "Org admins delete own assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );
