-- QUERY NAME: 73-org-statuses — Configurable status masters (Others → Status)
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 72-list-visibility-rpcs.sql
-- Org-configurable statuses for Work Request, Work Order, and PM plans.
-- Task statuses remain in task_statuses (managed from the same UI).
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_statuses (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  entity_type text not null
    check (entity_type in ('work_request', 'work_order', 'pm_plan')),
  key text not null,
  name text not null,
  color text,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_terminal boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, entity_type, key),
  unique (org_id, entity_type, name)
);

create index if not exists idx_org_statuses_org_entity_sort
  on public.org_statuses(org_id, entity_type, sort_order, name);

alter table public.org_statuses enable row level security;

-- Allow storing custom statuses on WR / WO / PM (app validates against org_statuses)
alter table public.work_requests drop constraint if exists work_requests_status_check;
alter table public.manual_work_orders drop constraint if exists manual_work_orders_status_check;
alter table public.pm_plans drop constraint if exists pm_plans_status_check;

-- Seed defaults for every org (idempotent)
insert into public.org_statuses (org_id, entity_type, key, name, color, sort_order, is_system, is_terminal, description)
select o.id, v.entity_type, v.key, v.name, v.color, v.sort_order, true, v.is_terminal, v.description
from public.organizations o
cross join (
  values
    -- Work Request
    ('work_request', 'draft', 'Draft', '#94A3B8', 0, false, 'Saved but not submitted'),
    ('work_request', 'submitted', 'Submitted', '#3B82F6', 1, false, 'Submitted for processing'),
    ('work_request', 'pending_approval', 'Pending approval', '#F59E0B', 2, false, 'Waiting for approval'),
    ('work_request', 'approved', 'Approved', '#10B981', 3, true, 'Approved and converted to work order'),
    ('work_request', 'rejected', 'Rejected', '#EF4444', 4, true, 'Rejected by approver'),
    ('work_request', 'need_info', 'Need info', '#8B5CF6', 5, false, 'More information requested'),
    ('work_request', 'cancelled', 'Cancelled', '#6B7280', 6, true, 'Cancelled'),
    -- Work Order
    ('work_order', 'draft', 'Draft', '#94A3B8', 0, false, 'Draft work order'),
    ('work_order', 'assigned', 'Assigned', '#3B82F6', 1, false, 'Assigned to technicians'),
    ('work_order', 'accepted', 'Accepted', '#06B6D4', 2, false, 'Accepted by technician'),
    ('work_order', 'started', 'Started', '#6366F1', 3, false, 'Work started'),
    ('work_order', 'in_progress', 'In progress', '#8B5CF6', 4, false, 'Work in progress'),
    ('work_order', 'waiting_material', 'Waiting material', '#F59E0B', 5, false, 'Waiting for material'),
    ('work_order', 'waiting_shutdown', 'Waiting shutdown', '#F97316', 6, false, 'Waiting for shutdown'),
    ('work_order', 'on_hold', 'On hold', '#EAB308', 7, false, 'On hold'),
    ('work_order', 'completed', 'Completed', '#10B981', 8, false, 'Work completed'),
    ('work_order', 'verified', 'Verified', '#14B8A6', 9, false, 'Verified by supervisor'),
    ('work_order', 'closed', 'Closed', '#6B7280', 10, true, 'Closed'),
    ('work_order', 'returned_rework', 'Returned / rework', '#EF4444', 11, false, 'Returned for rework'),
    -- Planned Maintenance
    ('pm_plan', 'inactive', 'Inactive', '#94A3B8', 0, false, 'Plan is inactive'),
    ('pm_plan', 'active', 'Active', '#10B981', 1, false, 'Plan is active'),
    ('pm_plan', 'overdue', 'Overdue', '#EF4444', 2, false, 'Next due date has passed')
) as v(entity_type, key, name, color, sort_order, is_terminal, description)
where not exists (
  select 1 from public.org_statuses s
  where s.org_id = o.id and s.entity_type = v.entity_type and s.key = v.key
);
