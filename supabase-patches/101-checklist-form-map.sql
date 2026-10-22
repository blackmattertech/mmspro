-- QUERY NAME: 101-checklist-form-map — Map checklists to forms
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 100-warranty-document-lines.sql
-- ══════════════════════════════════════════════════════════════

alter table public.checklist_templates
  add column if not exists form_ids text[] not null default '{}';

update public.checklist_templates
set form_ids = case module_key
  when 'work_request' then array['work_request.create']::text[]
  when 'work_order' then array['work_orders.manual']::text[]
  when 'pm_plan' then array['pm.plan']::text[]
  else form_ids
end
where coalesce(cardinality(form_ids), 0) = 0;
