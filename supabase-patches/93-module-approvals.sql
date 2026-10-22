-- QUERY NAME: 93-module-approvals — Department head approval per module
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 92-svg-image-uploads.sql
-- Company admins choose which modules require department head approval.
-- Missing work_request follows work_request_inter_approval_required.
-- ══════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists module_approvals jsonb not null default '{}'::jsonb;

comment on column public.organizations.module_approvals is
  'Per product module: true means department head approval is required. Empty object keeps existing work request behavior.';
