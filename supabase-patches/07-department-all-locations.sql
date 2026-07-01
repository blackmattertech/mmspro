-- Department can apply to all org locations (not a single site)
alter table public.departments
  add column if not exists all_locations boolean default false not null;
