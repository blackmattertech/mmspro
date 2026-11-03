-- QUERY NAME: 110-work-order-checklist-template — Checklist template on work orders
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 109-open-work-order-pool.sql
-- Work orders store the selected checklist template. Snapshot and values
-- already exist; the template id was only added on work_requests and pm_plans.
-- ══════════════════════════════════════════════════════════════

alter table public.manual_work_orders
  add column if not exists checklist_template_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manual_work_orders_checklist_template_id_fkey'
  ) then
    alter table public.manual_work_orders
      add constraint manual_work_orders_checklist_template_id_fkey
      foreign key (checklist_template_id)
      references public.checklist_templates(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_manual_work_orders_checklist_template
  on public.manual_work_orders(org_id, checklist_template_id)
  where checklist_template_id is not null;

notify pgrst, 'reload schema';
