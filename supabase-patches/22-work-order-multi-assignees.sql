-- QUERY NAME: 22-work-order-multi-assignees — Multiple employees per work order
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 21-work-order-assignment.sql
-- Replaces single assigned_to with junction table
-- ══════════════════════════════════════════════════════════════

create table if not exists public.manual_work_order_assignees (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_order_id uuid references public.manual_work_orders(id) on delete cascade not null,
  employee_id uuid references public.org_employees(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (work_order_id, employee_id)
);

create index if not exists idx_wo_assignees_org on public.manual_work_order_assignees(org_id);
create index if not exists idx_wo_assignees_wo on public.manual_work_order_assignees(work_order_id);
create index if not exists idx_wo_assignees_employee on public.manual_work_order_assignees(employee_id);

-- Migrate existing single assignments
insert into public.manual_work_order_assignees (org_id, work_order_id, employee_id)
select org_id, id, assigned_to
from public.manual_work_orders
where assigned_to is not null
on conflict (work_order_id, employee_id) do nothing;

alter table public.manual_work_orders drop column if exists assigned_to;

drop index if exists public.idx_manual_work_orders_assigned_to;
drop index if exists public.idx_manual_work_orders_assigned_status;

alter table public.manual_work_order_assignees enable row level security;

drop policy if exists "Org members read wo assignees" on public.manual_work_order_assignees;
create policy "Org members read wo assignees"
  on public.manual_work_order_assignees for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members manage wo assignees" on public.manual_work_order_assignees;
create policy "Org members manage wo assignees"
  on public.manual_work_order_assignees for all
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());
