-- QUERY NAME: 65-planned-maintenance — Planned Maintenance (PM) & Scheduled Work Orders
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 64-user-notifications.sql
-- PM activity types, checklist templates, PM plans, scheduler columns
-- on manual_work_orders, and plan audit trail.
-- ══════════════════════════════════════════════════════════════

-- ─── Activity types ───────────────────────────────────────────
create table if not exists public.pm_activity_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists idx_pm_activity_types_org
  on public.pm_activity_types(org_id, sort_order, name);

-- ─── Checklist templates (independent master) ─────────────────
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklist_templates_org
  on public.checklist_templates(org_id, name);

create table if not exists public.checklist_template_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  name text not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklist_template_fields_template
  on public.checklist_template_fields(template_id, sort_order);

-- ─── PM plan numbers ──────────────────────────────────────────
create table if not exists public.pm_plan_daily_sequences (
  org_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  seq_date date not null,
  last_number integer not null default 0,
  primary key (org_id, department_id, seq_date)
);

-- ─── PM plans ─────────────────────────────────────────────────
create table if not exists public.pm_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_number text,
  name text not null,
  department_id uuid not null references public.departments(id) on delete restrict,
  location_id uuid references public.org_locations(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  activity_type_id uuid references public.pm_activity_types(id) on delete set null,
  work_center text,
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  status text not null default 'inactive'
    check (status in ('active', 'inactive')),
  schedule_type text not null default 'monthly',
  every_n integer not null default 1,
  start_date date not null,
  end_date date,
  grace_days integer,
  generate_before_days integer not null default 1,
  working_shift text,
  next_due_at date,
  last_generated_at timestamptz,
  last_generated_due_at date,
  last_due_notice_on date,
  checklist_template_id uuid references public.checklist_templates(id) on delete set null,
  contractor_vendor_id uuid references public.vendors(id) on delete set null,
  estimated_labour_hours numeric,
  estimated_duration_hours numeric,
  required_tools text,
  required_skills text,
  allow_multiple_open boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_pm_plans_org_number
  on public.pm_plans(org_id, plan_number)
  where plan_number is not null;

create index if not exists idx_pm_plans_org_status
  on public.pm_plans(org_id, status);

create index if not exists idx_pm_plans_org_due
  on public.pm_plans(org_id, next_due_at)
  where status = 'active';

create table if not exists public.pm_plan_technicians (
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.pm_plans(id) on delete cascade,
  employee_id uuid not null references public.org_employees(id) on delete cascade,
  primary key (plan_id, employee_id)
);

create index if not exists idx_pm_plan_technicians_org
  on public.pm_plan_technicians(org_id, plan_id);

create table if not exists public.pm_plan_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.pm_plans(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_plan_audit_plan
  on public.pm_plan_audit(plan_id, created_at desc);

-- ─── Work order PM columns ────────────────────────────────────
alter table public.manual_work_orders
  add column if not exists pm_plan_id uuid references public.pm_plans(id) on delete set null,
  add column if not exists scheduled_at timestamptz,
  add column if not exists checklist_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists checklist_values jsonb not null default '{}'::jsonb;

create index if not exists idx_mwo_pm_plan
  on public.manual_work_orders(org_id, pm_plan_id)
  where pm_plan_id is not null;

create index if not exists idx_mwo_preventive
  on public.manual_work_orders(org_id, source_type, scheduled_at desc)
  where source_type = 'preventive_maintenance';

-- ─── Seed activity types for existing orgs ────────────────────
insert into public.pm_activity_types (org_id, name, description, sort_order, is_system)
select o.id, t.name, t.description, t.sort_order, true
from public.organizations o
cross join (
  values
    ('Inspection', 'Visual inspection and equipment condition assessment', 10),
    ('Calibration', 'Instrument calibration', 20),
    ('Functional Test', 'Operational testing', 30),
    ('Cleaning', 'Cleaning of equipment and panels', 40),
    ('Lubrication', 'Lubrication of rotating equipment', 50),
    ('Battery Maintenance', 'Battery inspection and replacement', 60),
    ('Condition Monitoring', 'Vibration, temperature and pressure monitoring', 70),
    ('Preventive Maintenance', 'OEM recommended maintenance', 80),
    ('Regulatory Inspection', 'Statutory inspection', 90),
    ('Shutdown Maintenance', 'Planned shutdown activities', 100),
    ('Custom Activity', 'User-defined maintenance type', 110)
) as t(name, description, sort_order)
on conflict (org_id, name) do nothing;

-- ─── RLS ──────────────────────────────────────────────────────
alter table public.pm_activity_types enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_fields enable row level security;
alter table public.pm_plan_daily_sequences enable row level security;
alter table public.pm_plans enable row level security;
alter table public.pm_plan_technicians enable row level security;
alter table public.pm_plan_audit enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'pm_activity_types',
    'checklist_templates',
    'checklist_template_fields',
    'pm_plan_daily_sequences',
    'pm_plans',
    'pm_plan_technicians',
    'pm_plan_audit'
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
    execute format('grant select, insert, update, delete on table public.%I to authenticated', tbl);
    execute format('grant all on table public.%I to service_role', tbl);
  end loop;
end $$;
