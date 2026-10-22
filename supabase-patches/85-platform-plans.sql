-- QUERY NAME: 85-platform-plans — Super Admin time-bound plans
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 84-platform-integrations.sql
-- Service role only. Super Admin creates trial, monthly, quarterly, and custom plans.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  interval_type text not null,
  duration_days integer not null,
  price numeric(12, 2),
  currency text not null default 'INR',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_plans_interval_check
    check (interval_type in ('trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom')),
  constraint platform_plans_duration_check
    check (duration_days > 0)
);

comment on table public.platform_plans is
  'Time-bound plans created by Super Admin. duration_days is the validity.';

alter table public.platform_plans enable row level security;
