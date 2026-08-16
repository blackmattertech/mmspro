-- QUERY NAME: 49-warranty-manager — Warranty records and line items
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 48-warranty-tasks-permissions.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists public.warranties (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  serial_number text not null,
  purchase_date date,
  make text,
  po_number text,
  po_date date,
  invoice_number text,
  invoice_date date,
  warranty_start date,
  warranty_end date,
  warranty_period_months integer,
  expiry_notification_days integer,
  vendor text,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, serial_number)
);

create index if not exists idx_warranties_org on public.warranties(org_id);
create index if not exists idx_warranties_org_serial on public.warranties(org_id, serial_number desc);

create table if not exists public.warranty_items (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  warranty_id uuid references public.warranties(id) on delete cascade not null,
  line_number integer not null default 1,
  product_name text,
  model_part_no text,
  value numeric(14, 2),
  remarks text,
  created_at timestamptz default now()
);

create index if not exists idx_warranty_items_warranty on public.warranty_items(warranty_id, line_number);

alter table public.warranties enable row level security;
alter table public.warranty_items enable row level security;

drop policy if exists "Org members read warranties" on public.warranties;
create policy "Org members read warranties"
  on public.warranties for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert warranties" on public.warranties;
create policy "Org members insert warranties"
  on public.warranties for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update warranties" on public.warranties;
create policy "Org members update warranties"
  on public.warranties for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete warranties" on public.warranties;
create policy "Org members delete warranties"
  on public.warranties for delete
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members read warranty items" on public.warranty_items;
create policy "Org members read warranty items"
  on public.warranty_items for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert warranty items" on public.warranty_items;
create policy "Org members insert warranty items"
  on public.warranty_items for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update warranty items" on public.warranty_items;
create policy "Org members update warranty items"
  on public.warranty_items for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete warranty items" on public.warranty_items;
create policy "Org members delete warranty items"
  on public.warranty_items for delete
  using (org_id = public.current_user_org_id());
