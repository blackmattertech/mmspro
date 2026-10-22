-- QUERY NAME: 90-module-actions — Checklist modules, PM recurrence, warranty alerts
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 89-list-query-controls.sql
-- ══════════════════════════════════════════════════════════════

alter table public.checklist_templates
  add column if not exists module_key text not null default 'pm_plan';

update public.checklist_templates
set module_key = 'pm_plan'
where module_key is null or module_key = '';

alter table public.checklist_templates
  drop constraint if exists checklist_templates_module_key_check;

alter table public.checklist_templates
  add constraint checklist_templates_module_key_check
  check (module_key in ('work_request', 'work_order', 'pm_plan'));

alter table public.pm_plans
  add column if not exists weekdays smallint[],
  add column if not exists custom_interval integer,
  add column if not exists custom_unit text,
  add column if not exists never_ends boolean not null default false;

alter table public.organizations
  add column if not exists warranty_expiry_lead_days integer not null default 7;

alter table public.work_requests
  add column if not exists checklist_template_id uuid,
  add column if not exists checklist_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists checklist_values jsonb not null default '{}'::jsonb;

create table if not exists public.warranty_expiry_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warranty_id uuid,
  alert_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, alert_key)
);

create index if not exists idx_warranty_expiry_alerts_org
  on public.warranty_expiry_alerts(org_id);
