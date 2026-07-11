-- QUERY NAME: 35-org-assets-employee-photos — Allow org members to upload employee photos
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 34-location-head-roles-access.sql
-- ══════════════════════════════════════════════════════════════
-- Employee photos: {org_id}/employees/{employee_id}.{ext}
-- Location Heads (and other non-admin users) create employees via the API
-- but upload photos with the browser Supabase client. Org-manager-only
-- storage policies caused: "new row violates row-level security policy".
-- Logos and other org-assets paths stay admin-only.

drop policy if exists "Org members upload employee photos" on storage.objects;
create policy "Org members upload employee photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'employees'
  );

drop policy if exists "Org members update employee photos" on storage.objects;
create policy "Org members update employee photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'employees'
  )
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'employees'
  );

drop policy if exists "Org members delete employee photos" on storage.objects;
create policy "Org members delete employee photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and (storage.foldername(name))[2] = 'employees'
  );
