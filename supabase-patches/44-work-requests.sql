-- QUERY NAME: 44-work-requests — Work request module
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 43-equipment-dynamic-identity.sql
-- ══════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists work_request_inter_approval_required boolean default true not null;

create table if not exists public.work_requests (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  request_number text not null,
  request_type text not null check (request_type in (
    'inter_department', 'intra_department', 'user_self', 'manual'
  )),
  status text not null default 'submitted' check (status in (
    'draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'need_info', 'cancelled'
  )),
  request_date timestamptz default now() not null,
  order_from_department_id uuid references public.departments(id) on delete restrict not null,
  order_to_department_id uuid references public.departments(id) on delete restrict not null,
  equipment_id uuid references public.equipment(id) on delete set null,
  asset_hierarchy jsonb default '[]'::jsonb not null,
  problem_description text not null,
  is_breakdown boolean default false not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  remarks text,
  attachments jsonb default '[]'::jsonb not null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approval_remarks text,
  rejection_reason text,
  manual_work_order_id uuid references public.manual_work_orders(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, request_number)
);

create index if not exists idx_work_requests_org on public.work_requests(org_id);
create index if not exists idx_work_requests_from_dept on public.work_requests(org_id, order_from_department_id);
create index if not exists idx_work_requests_to_dept on public.work_requests(org_id, order_to_department_id);
create index if not exists idx_work_requests_requested_by on public.work_requests(org_id, requested_by);
create index if not exists idx_work_requests_status on public.work_requests(org_id, status);

create table if not exists public.work_request_timeline (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_request_id uuid references public.work_requests(id) on delete cascade not null,
  event_type text not null,
  message text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_work_request_timeline_wr on public.work_request_timeline(work_request_id, created_at);

create table if not exists public.work_request_daily_sequences (
  org_id uuid references public.organizations(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  seq_date date not null,
  last_number integer not null default 0,
  primary key (org_id, department_id, seq_date)
);

alter table public.manual_work_orders
  add column if not exists work_request_id uuid references public.work_requests(id) on delete set null;

create unique index if not exists idx_manual_work_orders_work_request
  on public.manual_work_orders(work_request_id)
  where work_request_id is not null;

alter table public.work_requests enable row level security;
alter table public.work_request_timeline enable row level security;
alter table public.work_request_daily_sequences enable row level security;

drop policy if exists "Org members read work requests" on public.work_requests;
create policy "Org members read work requests"
  on public.work_requests for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work requests" on public.work_requests;
create policy "Org members insert work requests"
  on public.work_requests for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update work requests" on public.work_requests;
create policy "Org members update work requests"
  on public.work_requests for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members read work request timeline" on public.work_request_timeline;
create policy "Org members read work request timeline"
  on public.work_request_timeline for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert work request timeline" on public.work_request_timeline;
create policy "Org members insert work request timeline"
  on public.work_request_timeline for insert
  with check (org_id = public.current_user_org_id());
