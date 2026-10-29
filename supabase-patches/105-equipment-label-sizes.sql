-- QUERY NAME: 105-equipment-label-sizes — Saved QR label paper sizes
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 104-meter-reading-logger-role.sql
-- Org-wide custom paper sizes for equipment QR labels.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.equipment_label_sizes (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  width_mm numeric not null,
  height_mm numeric not null,
  created_at timestamptz default now() not null,
  constraint equipment_label_sizes_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint equipment_label_sizes_width check (width_mm >= 20 and width_mm <= 500),
  constraint equipment_label_sizes_height check (height_mm >= 20 and height_mm <= 500)
);

create unique index if not exists equipment_label_sizes_org_name
  on public.equipment_label_sizes (org_id, lower(btrim(name)));

comment on table public.equipment_label_sizes is
  'Custom paper sizes for equipment QR label PDFs, shared by the organization';

alter table public.equipment_label_sizes enable row level security;

drop policy if exists "Org members read equipment label sizes" on public.equipment_label_sizes;
create policy "Org members read equipment label sizes"
  on public.equipment_label_sizes for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org admins insert equipment label sizes" on public.equipment_label_sizes;
create policy "Org admins insert equipment label sizes"
  on public.equipment_label_sizes for insert
  with check (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );

drop policy if exists "Org admins delete equipment label sizes" on public.equipment_label_sizes;
create policy "Org admins delete equipment label sizes"
  on public.equipment_label_sizes for delete
  using (
    org_id = public.current_user_org_id()
    and public.current_user_org_role() in ('owner', 'admin')
  );
