-- QUERY NAME: supabase-dashboard — Plants and work orders (partial fix)
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run
-- Use if section 9 partially applied or you get "relation already exists"
-- ══════════════════════════════════════════════════════════════

create table if not exists plants (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  plant_id uuid references plants(id) on delete set null,
  work_order_number text not null,
  title text not null,
  description text,
  status text default 'open'
    check (status in ('open', 'in_progress', 'scheduled', 'completed', 'overdue')),
  priority text default 'medium'
    check (priority in ('high', 'medium', 'low')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  sla_due_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table plants enable row level security;
alter table work_orders enable row level security;

drop policy if exists "Org isolation on plants" on plants;
create policy "Org isolation on plants"
  on plants for all
  using (org_id = (select org_id from profiles where id = auth.uid()));

drop policy if exists "Org isolation on work_orders" on work_orders;
create policy "Org isolation on work_orders"
  on work_orders for all
  using (org_id = (select org_id from profiles where id = auth.uid()));

create or replace function seed_dashboard_demo(p_org_id uuid)
returns void as $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
begin
  if exists (select 1 from plants where org_id = p_org_id limit 1) then
    return;
  end if;

  insert into plants (org_id, name) values (p_org_id, 'Plant 1') returning id into p1;
  insert into plants (org_id, name) values (p_org_id, 'Plant 2') returning id into p2;
  insert into plants (org_id, name) values (p_org_id, 'Plant 3') returning id into p3;
  insert into plants (org_id, name) values (p_org_id, 'Plant 4') returning id into p4;
  insert into plants (org_id, name) values (p_org_id, 'Plant 5') returning id into p5;

  insert into work_orders (org_id, plant_id, work_order_number, title, status, priority, scheduled_at, created_at) values
    (p_org_id, p1, 'WO-1265', 'Motor overheating issue', 'open', 'high', now() + interval '2 days', now() - interval '2 hours'),
    (p_org_id, p2, 'WO-1264', 'Conveyor belt alignment', 'in_progress', 'medium', now() + interval '1 day', now() - interval '5 hours'),
    (p_org_id, p3, 'WO-1263', 'Hydraulic leak repair', 'scheduled', 'high', now() + interval '3 days', now() - interval '1 day'),
    (p_org_id, p4, 'WO-1262', 'Filter replacement', 'completed', 'low', now() - interval '1 day', now() - interval '2 days'),
    (p_org_id, p5, 'WO-1261', 'Pump vibration check', 'overdue', 'medium', now() - interval '2 days', now() - interval '4 days');
end;
$$ language plpgsql security definer;

-- Then seed your org (replace with your org id):
-- select seed_dashboard_demo('<your-org-id>');
