-- QUERY NAME: 61-work-order-wr-spec-compliance — WR/WO CMMS lifecycle compliance
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 60-task-performance.sql
-- Work Order numbering, source, planning, permits, execution docs,
-- lifecycle statuses, timeline, and WR↔WO sync fields.
-- ══════════════════════════════════════════════════════════════

-- ─── Work order daily sequences (WO-<DEPT>-<YYMMDD>-####) ───
create table if not exists public.work_order_daily_sequences (
  org_id uuid references public.organizations(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  seq_date date not null,
  last_number integer not null default 0,
  primary key (org_id, department_id, seq_date)
);

alter table public.work_order_daily_sequences enable row level security;

-- ─── Expand manual_work_orders ───
alter table public.manual_work_orders
  add column if not exists wo_number text,
  add column if not exists source_type text,
  add column if not exists priority text,
  add column if not exists problem_description text,
  add column if not exists is_breakdown boolean default false not null,
  add column if not exists equipment_id uuid references public.equipment(id) on delete set null,
  add column if not exists asset_hierarchy jsonb default '[]'::jsonb not null,
  add column if not exists attachments jsonb default '[]'::jsonb not null,
  add column if not exists form_field_values jsonb default '{}'::jsonb not null,
  add column if not exists work_center text,
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null,
  add column if not exists special_instructions text,
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_end_at timestamptz,
  add column if not exists planned_duration_hours numeric,
  add column if not exists permit_required boolean default false not null,
  add column if not exists permit_types text[] default '{}'::text[] not null,
  add column if not exists permit_number text,
  add column if not exists permit_issue_at timestamptz,
  add column if not exists permit_expiry_at timestamptz,
  add column if not exists permit_attachments jsonb default '[]'::jsonb not null,
  add column if not exists work_start_at timestamptz,
  add column if not exists work_end_at timestamptz,
  add column if not exists work_duration_hours numeric,
  add column if not exists vendor_id uuid,
  add column if not exists vendor_expense numeric,
  add column if not exists vendor_currency text default 'USD',
  add column if not exists labour_count integer,
  add column if not exists breakdown_start_at timestamptz,
  add column if not exists breakdown_end_at timestamptz,
  add column if not exists breakdown_duration_hours numeric,
  add column if not exists job_description text,
  add column if not exists root_cause text,
  add column if not exists action_taken text,
  add column if not exists material_consumed text,
  add column if not exists special_tools_used text,
  add column if not exists safety_precautions text,
  add column if not exists dos_and_donts text,
  add column if not exists lessons_learned text,
  add column if not exists execution_remarks text,
  add column if not exists verification_remarks text,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists closed_at timestamptz,
  add column if not exists requester_id uuid references public.profiles(id) on delete set null;

-- Source type check
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'manual_work_orders_source_type_check'
  ) then
    alter table public.manual_work_orders
      add constraint manual_work_orders_source_type_check
      check (
        source_type is null
        or source_type in (
          'approved_work_request',
          'preventive_maintenance',
          'manual',
          'breakdown',
          'user_self_request'
        )
      );
  end if;
end $$;

-- Priority check
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'manual_work_orders_priority_check'
  ) then
    alter table public.manual_work_orders
      add constraint manual_work_orders_priority_check
      check (priority is null or priority in ('high', 'medium', 'low'));
  end if;
end $$;

-- Replace status constraint with full lifecycle
alter table public.manual_work_orders drop constraint if exists manual_work_orders_status_check;

update public.manual_work_orders
set status = 'assigned'
where status = 'created';

alter table public.manual_work_orders
  add constraint manual_work_orders_status_check
  check (status in (
    'draft',
    'assigned',
    'accepted',
    'started',
    'in_progress',
    'waiting_material',
    'waiting_shutdown',
    'on_hold',
    'completed',
    'verified',
    'closed',
    'returned_rework'
  ));

create unique index if not exists idx_manual_work_orders_wo_number
  on public.manual_work_orders(org_id, wo_number)
  where wo_number is not null;

create index if not exists idx_manual_work_orders_source
  on public.manual_work_orders(org_id, source_type);

create index if not exists idx_manual_work_orders_equipment
  on public.manual_work_orders(org_id, equipment_id)
  where equipment_id is not null;

-- Backfill source for existing rows linked to WR
update public.manual_work_orders
set source_type = 'approved_work_request'
where work_request_id is not null
  and (source_type is null or source_type = '');

update public.manual_work_orders
set source_type = 'manual'
where work_request_id is null
  and (source_type is null or source_type = '');

-- ─── Work order timeline ───
create table if not exists public.work_order_timeline (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_order_id uuid references public.manual_work_orders(id) on delete cascade not null,
  event_type text not null,
  message text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  new_status text,
  remarks text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_work_order_timeline_wo
  on public.work_order_timeline(work_order_id, created_at);

alter table public.work_order_timeline enable row level security;

drop policy if exists "Org members read work order timeline" on public.work_order_timeline;
create policy "Org members read work order timeline"
  on public.work_order_timeline for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work order timeline" on public.work_order_timeline;
create policy "Org members insert work order timeline"
  on public.work_order_timeline for insert
  with check (org_id = public.current_user_org_id());

-- ─── Work order audit log (immutable activity history) ───
create table if not exists public.work_order_audit_log (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_order_id uuid references public.manual_work_orders(id) on delete cascade not null,
  actor_id uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  action text not null,
  previous_status text,
  new_status text,
  remarks text,
  ip_address text,
  device_info text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_work_order_audit_wo
  on public.work_order_audit_log(work_order_id, created_at);

alter table public.work_order_audit_log enable row level security;

drop policy if exists "Org members read work order audit" on public.work_order_audit_log;
create policy "Org members read work order audit"
  on public.work_order_audit_log for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work order audit" on public.work_order_audit_log;
create policy "Org members insert work order audit"
  on public.work_order_audit_log for insert
  with check (org_id = public.current_user_org_id());

-- ─── WR execution status mirror for sync visibility ───
alter table public.work_requests
  add column if not exists execution_status text;

create index if not exists idx_work_requests_execution_status
  on public.work_requests(org_id, execution_status)
  where execution_status is not null;

-- ─── WR attachments storage path helper note ───
-- attachments jsonb stores { path, name, mime_type, size, bucket }
-- Upload uses work-order-assets bucket under {org_id}/work-requests/{wr_id}/...
