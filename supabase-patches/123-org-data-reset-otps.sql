-- QUERY NAME: 123-org-data-reset-otps — OTP codes for company-admin module data reset
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 122-uom-master.sql
-- Stores hashed email OTPs for destructive org module resets.
-- Server (service role) only — no client RLS policies granted.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_data_reset_otps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  target_id text not null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_org_data_reset_otps_lookup
  on public.org_data_reset_otps (org_id, requested_by, target_id, created_at desc);

create index if not exists idx_org_data_reset_otps_expires
  on public.org_data_reset_otps (expires_at)
  where consumed_at is null;

alter table public.org_data_reset_otps enable row level security;

comment on table public.org_data_reset_otps is
  'Hashed OTPs for company-admin org module data reset confirmations (service-role only)';
