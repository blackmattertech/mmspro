-- QUERY NAME: 106-platform-hierarchy-defaults — Default asset hierarchy for companies without their own
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 105-equipment-label-sizes.sql
-- One saved hierarchy. Companies with no equipment fields receive a copy.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.platform_hierarchy_defaults (
  id text primary key default 'equipment',
  catalog jsonb not null default '[]'::jsonb,
  source_org_id uuid references public.organizations(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint platform_hierarchy_defaults_id_check check (id = 'equipment')
);

alter table public.platform_hierarchy_defaults enable row level security;

comment on table public.platform_hierarchy_defaults is
  'Super Admin default asset hierarchy. Used when a company has no equipment fields of its own.';
