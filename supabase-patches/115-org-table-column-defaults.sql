-- QUERY NAME: 115-org-table-column-defaults — Org-wide table column picker defaults
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 114-exclude-pm-from-regular-wo-lists.sql
-- Company admins can publish column visibility/order for all org users.
-- version increments on each Make default so clients force-refresh personal prefs.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_table_column_defaults (
  org_id uuid not null references public.organizations(id) on delete cascade,
  table_id text not null,
  prefs jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (org_id, table_id)
);

create index if not exists idx_org_table_column_defaults_org
  on public.org_table_column_defaults(org_id);

alter table public.org_table_column_defaults enable row level security;

drop policy if exists "Org members read table column defaults" on public.org_table_column_defaults;
create policy "Org members read table column defaults"
  on public.org_table_column_defaults for select
  using (org_id = public.current_user_org_id());
