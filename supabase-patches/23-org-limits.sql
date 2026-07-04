-- QUERY NAME: 23-org-limits — Organization resource limits
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 22-work-order-multi-assignees.sql
-- Per-tenant limits for locations, departments, employees, and logins.
-- NULL = unlimited. Defaults are applied by the server based on plan.
-- ══════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists location_limit integer,
  add column if not exists department_limit integer,
  add column if not exists employee_limit integer,
  add column if not exists login_limit integer;
