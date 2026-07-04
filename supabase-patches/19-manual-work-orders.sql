-- QUERY NAME: 19-manual-work-orders — Manual work orders and form field visibility
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 18-asset-field-dropdown.sql
-- Per-org visibility for asset fields on the manual work order form
-- ══════════════════════════════════════════════════════════════

create table if not exists public.work_order_field_settings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  field_id uuid references public.asset_fields(id) on delete cascade not null,
  is_visible boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, field_id)
);

create index if not exists idx_wo_field_settings_org on public.work_order_field_settings(org_id);
create index if not exists idx_wo_field_settings_field on public.work_order_field_settings(field_id);

create table if not exists public.manual_work_orders (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  status text default 'draft' not null check (status in ('draft', 'created')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_manual_work_orders_org on public.manual_work_orders(org_id);
create index if not exists idx_manual_work_orders_status on public.manual_work_orders(org_id, status);

create table if not exists public.manual_work_order_values (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  work_order_id uuid references public.manual_work_orders(id) on delete cascade not null,
  field_id uuid references public.asset_fields(id) on delete cascade not null,
  value_text text,
  value_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (work_order_id, field_id)
);

create index if not exists idx_manual_wo_values_wo on public.manual_work_order_values(work_order_id);
create index if not exists idx_manual_wo_values_field on public.manual_work_order_values(field_id);

alter table public.work_order_field_settings enable row level security;
alter table public.manual_work_orders enable row level security;
alter table public.manual_work_order_values enable row level security;

drop policy if exists "Org members read wo field settings" on public.work_order_field_settings;
create policy "Org members read wo field settings"
  on public.work_order_field_settings for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins manage wo field settings" on public.work_order_field_settings;
create policy "Org admins manage wo field settings"
  on public.work_order_field_settings for all
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  )
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org members read manual work orders" on public.manual_work_orders;
create policy "Org members read manual work orders"
  on public.manual_work_orders for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert manual work orders" on public.manual_work_orders;
create policy "Org members insert manual work orders"
  on public.manual_work_orders for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update manual work orders" on public.manual_work_orders;
create policy "Org members update manual work orders"
  on public.manual_work_orders for update
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members read manual wo values" on public.manual_work_order_values;
create policy "Org members read manual wo values"
  on public.manual_work_order_values for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members manage manual wo values" on public.manual_work_order_values;
create policy "Org members manage manual wo values"
  on public.manual_work_order_values for all
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());
