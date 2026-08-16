-- QUERY NAME: 50-vendor-master — Vendor master records
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 49-warranty-manager.sql
-- ══════════════════════════════════════════════════════════════

create table if not exists public.vendors (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  vendor_code text not null,
  name text not null,
  contact_person text,
  mobile text,
  email text,
  address_line1 text,
  address_line2 text,
  pincode text,
  city text,
  state text,
  gstin text,
  pan text,
  bank_account_number text,
  bank_name text,
  account_name text,
  ifsc_code text,
  branch text,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, vendor_code)
);

create index if not exists idx_vendors_org on public.vendors(org_id);
create index if not exists idx_vendors_org_code on public.vendors(org_id, vendor_code);
create index if not exists idx_vendors_org_name on public.vendors(org_id, name);

alter table public.vendors enable row level security;

drop policy if exists "Org members read vendors" on public.vendors;
create policy "Org members read vendors"
  on public.vendors for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert vendors" on public.vendors;
create policy "Org members insert vendors"
  on public.vendors for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update vendors" on public.vendors;
create policy "Org members update vendors"
  on public.vendors for update
  using (org_id = public.current_user_org_id())
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members delete vendors" on public.vendors;
create policy "Org members delete vendors"
  on public.vendors for delete
  using (org_id = public.current_user_org_id());
