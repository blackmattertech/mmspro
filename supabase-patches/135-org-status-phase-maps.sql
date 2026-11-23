-- QUERY NAME: 135-org-status-phase-maps — Status Filter pill mappings
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 134-record-templates.sql
-- Org-configurable mapping of module statuses → list pill buckets.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_status_phase_maps (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  entity_type text not null
    check (entity_type in ('work_request', 'work_order', 'task', 'pm_plan', 'warranty')),
  status_key text not null,
  phase_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, entity_type, status_key)
);

create index if not exists idx_org_status_phase_maps_org_entity
  on public.org_status_phase_maps(org_id, entity_type, phase_id);

alter table public.org_status_phase_maps enable row level security;

-- Seed fixed-key defaults for every org (WR / WO / PM / Warranty). Task maps are
-- seeded by the API from task_statuses ids when first loaded.
insert into public.org_status_phase_maps (org_id, entity_type, status_key, phase_id)
select o.id, v.entity_type, v.status_key, v.phase_id
from public.organizations o
cross join (
  values
    -- Work Request (display / effective keys)
    ('work_request', 'submitted', 'open'),
    ('work_request', 'pending_approval', 'open'),
    ('work_request', 'need_info', 'open'),
    ('work_request', 'info_provided', 'open'),
    ('work_request', 'work_order_generated', 'open'),
    ('work_request', 'technician_assigned', 'open'),
    ('work_request', 'accepted', 'open'),
    ('work_request', 'started', 'in_progress'),
    ('work_request', 'in_progress', 'in_progress'),
    ('work_request', 'waiting_material', 'waiting'),
    ('work_request', 'waiting_shutdown', 'waiting'),
    ('work_request', 'on_hold', 'waiting'),
    ('work_request', 'returned_rework', 'waiting'),
    ('work_request', 'completed', 'done'),
    ('work_request', 'verified', 'done'),
    ('work_request', 'rejected', 'closed'),
    ('work_request', 'cancelled', 'closed'),
    ('work_request', 'closed', 'closed'),
    -- Work Order
    ('work_order', 'assigned', 'open'),
    ('work_order', 'accepted', 'open'),
    ('work_order', 'started', 'in_progress'),
    ('work_order', 'in_progress', 'in_progress'),
    ('work_order', 'waiting_material', 'waiting'),
    ('work_order', 'waiting_shutdown', 'waiting'),
    ('work_order', 'on_hold', 'waiting'),
    ('work_order', 'returned_rework', 'waiting'),
    ('work_order', 'completed', 'done'),
    ('work_order', 'verified', 'done'),
    ('work_order', 'closed', 'closed'),
    -- PM plans
    ('pm_plan', 'inactive', 'inactive'),
    ('pm_plan', 'active', 'active'),
    ('pm_plan', 'overdue', 'overdue'),
    -- Warranty buckets
    ('warranty', 'in_warranty', 'in_warranty'),
    ('warranty', 'active', 'in_warranty'),
    ('warranty', 'expiring_soon', 'expiring_soon'),
    ('warranty', 'expired', 'expired'),
    ('warranty', 'out_of_warranty', 'out_of_warranty')
) as v(entity_type, status_key, phase_id)
where not exists (
  select 1 from public.org_status_phase_maps m
  where m.org_id = o.id
    and m.entity_type = v.entity_type
    and m.status_key = v.status_key
);

-- Task defaults: non-terminal → open, terminal → done (API refine on ensure)
insert into public.org_status_phase_maps (org_id, entity_type, status_key, phase_id)
select ts.org_id, 'task', ts.id::text,
  case when ts.is_terminal then 'done' else 'open' end
from public.task_statuses ts
where not exists (
  select 1 from public.org_status_phase_maps m
  where m.org_id = ts.org_id
    and m.entity_type = 'task'
    and m.status_key = ts.id::text
);

comment on table public.org_status_phase_maps is
  'Maps module status keys to Status Filter pill phase ids per organization.';
