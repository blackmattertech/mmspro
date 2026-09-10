-- QUERY NAME: 76-pm-plan-overdue-status — Overdue status for PM plans
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 75-pm-schedule-reading.sql
-- Adds the system "overdue" status used when a plan's next due date has passed.
-- ══════════════════════════════════════════════════════════════

insert into public.org_statuses (org_id, entity_type, key, name, color, sort_order, is_system, is_terminal, description)
select o.id, 'pm_plan', 'overdue', 'Overdue', '#EF4444', 2, true, false, 'Next due date has passed'
from public.organizations o
where not exists (
  select 1 from public.org_statuses s
  where s.org_id = o.id and s.entity_type = 'pm_plan' and s.key = 'overdue'
);
