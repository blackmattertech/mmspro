-- QUERY NAME: 79-org-disabled-modules — Super Admin per-org module entitlements
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 78-department-code.sql
-- Empty array = all product modules enabled (existing orgs unchanged).
-- ══════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists disabled_modules text[] not null default '{}';

comment on column public.organizations.disabled_modules is
  'Product module ids hidden from company login. Empty = all enabled.';
