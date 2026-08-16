-- QUERY NAME: 53-task-management — Task Management module
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 52-warranty-serial-format.sql
-- ══════════════════════════════════════════════════════════════

-- Dynamic statuses (org-configurable)
create table if not exists public.task_statuses (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_terminal boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, name)
);

create index if not exists idx_task_statuses_org_sort on public.task_statuses(org_id, sort_order, name);

-- Dynamic priorities (org-configurable)
create table if not exists public.task_priorities (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  icon text,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, name)
);

create index if not exists idx_task_priorities_org_sort on public.task_priorities(org_id, sort_order, name);

-- Core tasks
create table if not exists public.tasks (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  title text not null,
  short_description text,
  detailed_description text,
  visibility_type text not null default 'self'
    check (visibility_type in ('self', 'team', 'department', 'location')),
  task_type text not null default 'one_time'
    check (task_type in ('one_time', 'recurring')),
  status_id uuid references public.task_statuses(id) on delete restrict not null,
  priority_id uuid references public.task_priorities(id) on delete restrict not null,
  start_date date,
  start_time time,
  due_date date,
  due_time time,
  department_id uuid references public.departments(id) on delete set null,
  location_id uuid references public.org_locations(id) on delete set null,
  recurrence_series_id uuid,
  parent_recurring_id uuid references public.tasks(id) on delete set null,
  is_recurrence_template boolean not null default false,
  completed_at timestamptz,
  tags text[] default '{}',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tasks_org on public.tasks(org_id);
create index if not exists idx_tasks_org_status on public.tasks(org_id, status_id);
create index if not exists idx_tasks_org_priority on public.tasks(org_id, priority_id);
create index if not exists idx_tasks_org_due on public.tasks(org_id, due_date, due_time);
create index if not exists idx_tasks_org_creator on public.tasks(org_id, created_by_profile_id);
create index if not exists idx_tasks_org_dept on public.tasks(org_id, department_id) where department_id is not null;
create index if not exists idx_tasks_org_loc on public.tasks(org_id, location_id) where location_id is not null;
create index if not exists idx_tasks_recurrence_series on public.tasks(recurrence_series_id) where recurrence_series_id is not null;

-- Task assignees (team visibility + explicit assignments)
create table if not exists public.task_assignees (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  employee_id uuid references public.org_employees(id) on delete cascade not null,
  assigned_by_profile_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz default now(),
  unique (task_id, employee_id)
);

create index if not exists idx_task_assignees_task on public.task_assignees(task_id);
create index if not exists idx_task_assignees_employee on public.task_assignees(org_id, employee_id);

-- Recurrence configuration (one row per recurring template)
create table if not exists public.task_recurrence (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null unique,
  frequency text not null
    check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  custom_interval integer,
  custom_unit text check (custom_unit is null or custom_unit in ('days', 'weeks', 'months')),
  weekdays smallint[] default '{}',
  recurrence_start_date date,
  recurrence_end_date date,
  never_ends boolean not null default false,
  last_generated_at timestamptz,
  next_occurrence_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_task_recurrence_next on public.task_recurrence(org_id, next_occurrence_at)
  where next_occurrence_at is not null;

-- Reminders
create table if not exists public.task_reminders (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  reminder_type text not null,
  custom_minutes_before integer,
  remind_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_task_reminders_due on public.task_reminders(org_id, remind_at)
  where sent_at is null and remind_at is not null;

-- Attachments
create table if not exists public.task_attachments (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  content_type text,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_task_attachments_task on public.task_attachments(task_id);

-- External links
create table if not exists public.task_links (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  title text not null,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_task_links_task on public.task_links(task_id, sort_order);

-- Comments (with optional parent for replies)
create table if not exists public.task_comments (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  parent_comment_id uuid references public.task_comments(id) on delete cascade,
  body text not null,
  mentions uuid[] default '{}',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_task_comments_task on public.task_comments(task_id, created_at);

-- Activity timeline / audit
create table if not exists public.task_activities (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  task_id uuid references public.tasks(id) on delete cascade not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_task_activities_task on public.task_activities(task_id, created_at desc);

-- RLS
alter table public.task_statuses enable row level security;
alter table public.task_priorities enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_recurrence enable row level security;
alter table public.task_reminders enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_links enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activities enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'task_statuses', 'task_priorities', 'tasks', 'task_assignees',
    'task_recurrence', 'task_reminders', 'task_attachments',
    'task_links', 'task_comments', 'task_activities'
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
