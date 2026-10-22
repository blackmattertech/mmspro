-- QUERY NAME: 87-subscription-signup — Company details held until payment
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 86-platform-subscriptions.sql
-- Stores landing-page company details on the checkout. The login email
-- is sent only after Cashfree reports the order as paid.
-- ══════════════════════════════════════════════════════════════

alter table public.platform_subscriptions
  add column if not exists signup jsonb,
  add column if not exists welcome_sent_at timestamptz;

comment on column public.platform_subscriptions.signup is
  'Company details collected before checkout. The temporary password is not stored here.';

comment on column public.platform_subscriptions.welcome_sent_at is
  'Set when a paid checkout has been turned into a company login.';
