-- QUERY NAME: 94-task-equipment-reference — Equipment reference on tasks
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 59-task-spec-compliance.sql
-- Lets a scanned equipment record be stored as a task reference.
-- ══════════════════════════════════════════════════════════════

alter table public.task_references
  drop constraint if exists task_references_reference_type_check;

alter table public.task_references
  add constraint task_references_reference_type_check
  check (reference_type in (
    'work_order', 'purchase_order', 'purchase_request', 'vendor_ref',
    'contract', 'amc', 'document', 'custom', 'equipment'
  ));
