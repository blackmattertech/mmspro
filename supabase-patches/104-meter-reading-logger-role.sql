-- QUERY NAME: 104-meter-reading-logger-role — Logger department and designation
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 103-equipment-meter-readings.sql
-- Stores the logger's department and access role (designation) on each reading.
-- ══════════════════════════════════════════════════════════════

alter table public.equipment_meter_readings
  add column if not exists logged_by_department text,
  add column if not exists logged_by_designation text;

alter table public.equipment
  add column if not exists last_meter_logged_by_department text,
  add column if not exists last_meter_logged_by_designation text;

update public.equipment_meter_readings as reading
set
  logged_by_department = coalesce(reading.logged_by_department, src.department_name),
  logged_by_designation = coalesce(reading.logged_by_designation, src.designation_name)
from (
  select distinct on (row.id)
    row.id,
    dept.name as department_name,
    role.name as designation_name
  from public.equipment_meter_readings row
  join public.org_employees employee
    on employee.org_id = row.org_id
   and (
     employee.profile_id = row.logged_by
     or exists (
       select 1
       from public.profiles profile
       where profile.id = row.logged_by
         and profile.email is not null
         and employee.email is not null
         and lower(employee.email) = lower(profile.email)
     )
   )
  left join public.departments dept on dept.id = employee.department_id
  left join public.org_access_roles role on role.id = employee.access_role_id
  where row.logged_by is not null
  order by row.id, (employee.profile_id = row.logged_by) desc
) as src
where reading.id = src.id
  and (
    reading.logged_by_department is null
    or reading.logged_by_designation is null
  );

update public.equipment_meter_readings as reading
set
  logged_by_department = coalesce(reading.logged_by_department, src.department_name),
  logged_by_designation = coalesce(reading.logged_by_designation, src.designation_name)
from (
  select
    row.id,
    dept.name as department_name,
    role.name as designation_name
  from public.equipment_meter_readings row
  join public.profiles profile on profile.id = row.logged_by
  join public.org_employees employee
    on employee.org_id = row.org_id
   and lower(btrim(employee.name)) = lower(btrim(profile.full_name))
  left join public.departments dept on dept.id = employee.department_id
  left join public.org_access_roles role on role.id = employee.access_role_id
  where row.logged_by is not null
    and profile.full_name is not null
    and btrim(profile.full_name) <> ''
    and (
      select count(*)
      from public.org_employees same_name
      where same_name.org_id = row.org_id
        and lower(btrim(same_name.name)) = lower(btrim(profile.full_name))
    ) = 1
) as src
where reading.id = src.id
  and (
    reading.logged_by_department is null
    or reading.logged_by_designation is null
  );

update public.equipment as equipment
set
  last_meter_logged_by_department = latest.logged_by_department,
  last_meter_logged_by_designation = latest.logged_by_designation
from (
  select distinct on (equipment_id)
    equipment_id,
    logged_by_department,
    logged_by_designation
  from public.equipment_meter_readings
  order by equipment_id, reading_at desc
) as latest
where equipment.id = latest.equipment_id;
