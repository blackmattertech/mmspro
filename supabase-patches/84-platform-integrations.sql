-- QUERY NAME: 84-platform-integrations — Super Admin email, Firebase, and Cashfree settings
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 83-performance-aggregations.sql
-- Service role only. No client policies, so org users cannot read secrets.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.platform_integrations (
  provider text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint platform_integrations_provider_check
    check (provider in ('email', 'firebase', 'cashfree'))
);

comment on table public.platform_integrations is
  'Platform-wide integration secrets managed from the Super Admin panel.';

alter table public.platform_integrations enable row level security;
