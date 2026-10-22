-- QUERY NAME: 86-platform-subscriptions — Cashfree sandbox subscriptions
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 85-platform-plans.sql
-- Service role only. One row per Cashfree checkout from the landing page.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.platform_plans(id) on delete set null,
  plan_name text not null,
  plan_code text,
  order_id text not null unique,
  amount numeric(12, 2) not null,
  currency text not null default 'INR',
  status text not null default 'ACTIVE',
  environment text not null default 'sandbox',
  duration_days integer,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_subscriptions_status_check
    check (status in ('ACTIVE', 'PAID', 'EXPIRED', 'TERMINATED', 'FAILED')),
  constraint platform_subscriptions_environment_check
    check (environment in ('sandbox', 'production'))
);

comment on table public.platform_subscriptions is
  'Landing-page Cashfree checkouts. status ACTIVE means awaiting payment.';

alter table public.platform_subscriptions enable row level security;
