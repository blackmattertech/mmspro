-- QUERY NAME: 29-account-roles — Super Admin / Admin / User account roles
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 28-org-access-roles.sql
-- Migrates profiles.role:
--   admin  → super_admin  (platform panel)
--   owner  → admin        (company admin)
--   member → user
-- ══════════════════════════════════════════════════════════════

-- 1. Widen constraint so we can migrate in place
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'member', 'super_admin', 'user'));

-- 2. Migrate in order (platform admin first, then owner → admin, then member → user)
update public.profiles set role = 'super_admin' where role = 'admin';
update public.profiles set role = 'admin' where role = 'owner';
update public.profiles set role = 'user' where role = 'member';

-- 3. Lock to the three account roles only
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  alter column role set default 'user';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'user'));

-- 4. Helper used by RLS for company management
create or replace function public.current_user_is_org_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role in ('admin', 'super_admin')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

-- 5. Signup / onboard RPC assigns company Admin
create or replace function public.create_org_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_email text;
begin
  select email into v_email from auth.users where id = p_user_id;

  insert into public.profiles (id, email)
  values (p_user_id, v_email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);

  insert into public.organizations (name, slug, email)
  values (p_org_name, p_org_slug, v_email)
  returning id into v_org_id;

  update public.profiles
  set org_id = v_org_id, role = 'admin'
  where id = p_user_id;

  return v_org_id;
end;
$$;

-- 6. Refresh RLS policies that previously allowed owner/admin
-- organizations
drop policy if exists "Org admins update own organization" on public.organizations;
drop policy if exists "Org owners update own org" on public.organizations;
drop policy if exists "Org admins update own org" on public.organizations;
create policy "Org admins update own organization"
  on public.organizations for update
  using (
    id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- org_locations
drop policy if exists "Org admins insert locations" on public.org_locations;
create policy "Org admins insert locations"
  on public.org_locations for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update locations" on public.org_locations;
create policy "Org admins update locations"
  on public.org_locations for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete locations" on public.org_locations;
create policy "Org admins delete locations"
  on public.org_locations for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- departments
drop policy if exists "Org admins insert departments" on public.departments;
create policy "Org admins insert departments"
  on public.departments for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update departments" on public.departments;
create policy "Org admins update departments"
  on public.departments for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete departments" on public.departments;
create policy "Org admins delete departments"
  on public.departments for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- designations
drop policy if exists "Org admins insert designations" on public.designations;
create policy "Org admins insert designations"
  on public.designations for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update designations" on public.designations;
create policy "Org admins update designations"
  on public.designations for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete designations" on public.designations;
create policy "Org admins delete designations"
  on public.designations for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- designation_departments
drop policy if exists "Org admins insert designation departments" on public.designation_departments;
create policy "Org admins insert designation departments"
  on public.designation_departments for insert
  with check (
    exists (
      select 1 from public.designations d
      where d.id = designation_id
        and d.org_id = public.current_user_org_id()
        and public.current_user_is_org_manager()
    )
  );

drop policy if exists "Org admins delete designation departments" on public.designation_departments;
create policy "Org admins delete designation departments"
  on public.designation_departments for delete
  using (
    exists (
      select 1 from public.designations d
      where d.id = designation_id
        and d.org_id = public.current_user_org_id()
        and public.current_user_is_org_manager()
    )
  );

-- org_employees
drop policy if exists "Org admins insert employees" on public.org_employees;
create policy "Org admins insert employees"
  on public.org_employees for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update employees" on public.org_employees;
create policy "Org admins update employees"
  on public.org_employees for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete employees" on public.org_employees;
create policy "Org admins delete employees"
  on public.org_employees for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- org_employee_emails
drop policy if exists "Org admins insert employee emails" on public.org_employee_emails;
create policy "Org admins insert employee emails"
  on public.org_employee_emails for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete employee emails" on public.org_employee_emails;
create policy "Org admins delete employee emails"
  on public.org_employee_emails for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- department_location_heads
drop policy if exists "Org admins insert department location heads" on public.department_location_heads;
create policy "Org admins insert department location heads"
  on public.department_location_heads for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update department location heads" on public.department_location_heads;
create policy "Org admins update department location heads"
  on public.department_location_heads for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete department location heads" on public.department_location_heads;
create policy "Org admins delete department location heads"
  on public.department_location_heads for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- asset_fields
drop policy if exists "Org admins insert asset fields" on public.asset_fields;
create policy "Org admins insert asset fields"
  on public.asset_fields for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update asset fields" on public.asset_fields;
create policy "Org admins update asset fields"
  on public.asset_fields for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete asset fields" on public.asset_fields;
create policy "Org admins delete asset fields"
  on public.asset_fields for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- work_order_field_settings
drop policy if exists "Org admins insert wo field settings" on public.work_order_field_settings;
drop policy if exists "Org admins manage wo field settings" on public.work_order_field_settings;
create policy "Org admins manage wo field settings"
  on public.work_order_field_settings for all
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  )
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- org_access_roles
drop policy if exists "Org admins insert access roles" on public.org_access_roles;
create policy "Org admins insert access roles"
  on public.org_access_roles for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update access roles" on public.org_access_roles;
create policy "Org admins update access roles"
  on public.org_access_roles for update
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete access roles" on public.org_access_roles;
create policy "Org admins delete access roles"
  on public.org_access_roles for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_is_org_manager()
  );

-- org_access_role_permissions
drop policy if exists "Org admins insert role permissions" on public.org_access_role_permissions;
create policy "Org admins insert role permissions"
  on public.org_access_role_permissions for insert
  with check (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_is_org_manager()
    )
  );

drop policy if exists "Org admins update role permissions" on public.org_access_role_permissions;
create policy "Org admins update role permissions"
  on public.org_access_role_permissions for update
  using (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_is_org_manager()
    )
  );

drop policy if exists "Org admins delete role permissions" on public.org_access_role_permissions;
create policy "Org admins delete role permissions"
  on public.org_access_role_permissions for delete
  using (
    exists (
      select 1 from public.org_access_roles r
      where r.id = role_id
        and r.org_id = public.current_user_org_id()
        and public.current_user_is_org_manager()
    )
  );

-- storage org-assets write policies
drop policy if exists "Org admins upload own assets" on storage.objects;
create policy "Org admins upload own assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins update own assets" on storage.objects;
create policy "Org admins update own assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and public.current_user_is_org_manager()
  )
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and public.current_user_is_org_manager()
  );

drop policy if exists "Org admins delete own assets" on storage.objects;
create policy "Org admins delete own assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = (
      select org_id::text from public.profiles where id = auth.uid()
    )
    and public.current_user_is_org_manager()
  );
