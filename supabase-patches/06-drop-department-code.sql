-- Drop department code column (no longer used)
alter table public.departments drop constraint if exists departments_org_id_code_key;
alter table public.departments drop column if exists code;
