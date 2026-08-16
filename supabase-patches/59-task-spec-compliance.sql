-- QUERY NAME: 59-task-spec-compliance — Task spec compliance schema
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 58-trigram-search-indexes.sql
-- ══════════════════════════════════════════════════════════════

-- Task categories (admin-configurable)
create table if not exists public.task_categories (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, name)
);

create index if not exists idx_task_categories_org_sort on public.task_categories(org_id, sort_order, name);

-- Task tags master (admin-configurable)
create table if not exists public.task_tags (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, name)
);

create index if not exists idx_task_tags_org_sort on public.task_tags(org_id, sort_order, name);

-- Task tag assignments (many-to-many)
create table if not exists public.task_tag_assignments (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  tag_id uuid references public.task_tags(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (task_id, tag_id)
);

create index if not exists idx_task_tag_assignments_task on public.task_tag_assignments(task_id);
create index if not exists idx_task_tag_assignments_tag on public.task_tag_assignments(org_id, tag_id);

-- Task references (structured + free-text)
create table if not exists public.task_references (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  reference_type text not null
    check (reference_type in (
      'work_order', 'purchase_order', 'purchase_request', 'vendor_ref',
      'contract', 'amc', 'document', 'custom'
    )),
  reference_entity_type text,
  reference_entity_id uuid,
  reference_label text,
  reference_number text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_task_references_task on public.task_references(task_id, sort_order);
create index if not exists idx_task_references_number on public.task_references(org_id, reference_number)
  where reference_number is not null;

-- Per-org task number sequence
create table if not exists public.task_sequences (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  last_value integer not null default 0,
  updated_at timestamptz default now()
);

-- Extend tasks table
alter table public.tasks
  add column if not exists task_number text,
  add column if not exists category_id uuid references public.task_categories(id) on delete set null,
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists follow_up_remarks text,
  add column if not exists next_action text,
  add column if not exists completion_remarks text;

create unique index if not exists idx_tasks_org_task_number
  on public.tasks(org_id, task_number)
  where task_number is not null;

create index if not exists idx_tasks_category on public.tasks(org_id, category_id)
  where category_id is not null;

create index if not exists idx_tasks_vendor on public.tasks(org_id, vendor_id)
  where vendor_id is not null;

-- Extend recurrence frequency for half-yearly
alter table public.task_recurrence drop constraint if exists task_recurrence_frequency_check;
alter table public.task_recurrence add constraint task_recurrence_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom'));

-- Trigram indexes for search
create extension if not exists pg_trgm;

create index if not exists idx_tasks_task_number_trgm
  on public.tasks using gin (task_number gin_trgm_ops)
  where task_number is not null;

-- RLS for new tables
alter table public.task_categories enable row level security;
alter table public.task_tags enable row level security;
alter table public.task_tag_assignments enable row level security;
alter table public.task_references enable row level security;
alter table public.task_sequences enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'task_categories', 'task_tags', 'task_tag_assignments', 'task_references', 'task_sequences'
  ] loop
    execute format('drop policy if exists "Org members read %1$s" on public.%1$I', tbl);
    execute format(
      'create policy "Org members read %1$s" on public.%1$I for select using (org_id = public.current_user_org_id())',
      tbl
    );
    execute format('drop policy if exists "Org members insert %1$s" on public.%1$I', tbl);
    execute format(
      'create policy "Org members insert %1$s" on public.%1$I for insert with check (org_id = public.current_user_org_id())',
      tbl
    );
    execute format('drop policy if exists "Org members update %1$s" on public.%1$I', tbl);
    execute format(
      'create policy "Org members update %1$s" on public.%1$I for update using (org_id = public.current_user_org_id()) with check (org_id = public.current_user_org_id())',
      tbl
    );
    execute format('drop policy if exists "Org members delete %1$s" on public.%1$I', tbl);
    execute format(
      'create policy "Org members delete %1$s" on public.%1$I for delete using (org_id = public.current_user_org_id())',
      tbl
    );
  end loop;
end $$;

-- Rename default status To Do → Open where safe
update public.task_statuses
set name = 'Open', updated_at = now()
where name = 'To Do'
  and not exists (
    select 1 from public.task_statuses s2
    where s2.org_id = task_statuses.org_id and s2.name = 'Open' and s2.id <> task_statuses.id
  );

-- Seed default categories per org (idempotent)
insert into public.task_categories (org_id, name, sort_order, is_active)
select o.id, cat.name, cat.sort_order, true
from public.organizations o
cross join (
  values
    ('Procurement', 0),
    ('Vendor Follow-up', 1),
    ('Renewal', 2),
    ('Documentation', 3),
    ('Maintenance Planning', 4),
    ('Meeting', 5),
    ('Action', 6),
    ('Personal', 7),
    ('Others', 8)
) as cat(name, sort_order)
where not exists (
  select 1 from public.task_categories tc where tc.org_id = o.id limit 1
);

-- Seed default tags per org (idempotent)
insert into public.task_tags (org_id, name, sort_order, is_active)
select o.id, tag.name, tag.sort_order, true
from public.organizations o
cross join (
  values
    ('Shutdown', 0),
    ('Vendor', 1),
    ('Safety', 2),
    ('Calibration', 3),
    ('Spare Parts', 4),
    ('Emergency', 5),
    ('Warranty', 6),
    ('AMC', 7),
    ('Inspection', 8),
    ('Documentation', 9),
    ('Compliance', 10),
    ('Meeting', 11)
) as tag(name, sort_order)
where not exists (
  select 1 from public.task_tags tt where tt.org_id = o.id limit 1
);

-- Migrate legacy tasks.tags[] to tag master assignments
insert into public.task_tag_assignments (org_id, task_id, tag_id)
select distinct t.org_id, t.id, tt.id
from public.tasks t
cross join lateral unnest(coalesce(t.tags, '{}'::text[])) as tag_name(name)
join public.task_tags tt on tt.org_id = t.org_id and lower(tt.name) = lower(tag_name.name)
where tag_name.name is not null and trim(tag_name.name) <> ''
on conflict (task_id, tag_id) do nothing;

-- Create missing tags from legacy array and assign
insert into public.task_tags (org_id, name, sort_order, is_active)
select distinct t.org_id, trim(tag_name.name), 100, true
from public.tasks t
cross join lateral unnest(coalesce(t.tags, '{}'::text[])) as tag_name(name)
where tag_name.name is not null
  and trim(tag_name.name) <> ''
  and not exists (
    select 1 from public.task_tags tt
    where tt.org_id = t.org_id and lower(tt.name) = lower(trim(tag_name.name))
  )
on conflict (org_id, name) do nothing;

insert into public.task_tag_assignments (org_id, task_id, tag_id)
select distinct t.org_id, t.id, tt.id
from public.tasks t
cross join lateral unnest(coalesce(t.tags, '{}'::text[])) as tag_name(name)
join public.task_tags tt on tt.org_id = t.org_id and lower(tt.name) = lower(trim(tag_name.name))
where tag_name.name is not null and trim(tag_name.name) <> ''
on conflict (task_id, tag_id) do nothing;

-- Backfill task numbers for existing tasks
do $$
declare
  org_rec record;
  task_rec record;
  seq integer;
begin
  for org_rec in select id from public.organizations loop
    seq := 0;
    for task_rec in
      select id from public.tasks
      where org_id = org_rec.id and task_number is null
      order by created_at asc
    loop
      seq := seq + 1;
      update public.tasks
      set task_number = 'TSK-' || lpad(seq::text, 5, '0')
      where id = task_rec.id;
    end loop;
    if seq > 0 then
      insert into public.task_sequences (org_id, last_value)
      values (org_rec.id, seq)
      on conflict (org_id) do update set last_value = greatest(task_sequences.last_value, excluded.last_value);
    end if;
  end loop;
end $$;

-- Default category for tasks missing category_id
update public.tasks t
set category_id = (
  select tc.id from public.task_categories tc
  where tc.org_id = t.org_id and tc.name = 'Others'
  limit 1
)
where t.category_id is null;
