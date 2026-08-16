-- QUERY NAME: 62-performance-indexes-3 — List/query covering indexes after paged APIs
-- MMS PRO patch | Safe to re-run | Apply after 61-work-order-wr-spec-compliance.sql
-- Composite/trigram indexes for paged list queries. Confirm 57/58/60 are applied first.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Assignee lookups that filter employee_id without org_id
CREATE INDEX IF NOT EXISTS idx_task_assignees_employee_id
  ON public.task_assignees(employee_id);

-- Equipment / area placement filters
CREATE INDEX IF NOT EXISTS idx_equipment_org_loc_dept
  ON public.equipment(org_id, location_id, department_id);

CREATE INDEX IF NOT EXISTS idx_areas_org_loc_dept
  ON public.areas(org_id, location_id, department_id);

-- Work request list covering indexes
CREATE INDEX IF NOT EXISTS idx_work_requests_org_to_dept_date
  ON public.work_requests(org_id, order_to_department_id, request_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_requests_org_from_dept_date
  ON public.work_requests(org_id, order_from_department_id, request_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_requests_org_requested_by_date
  ON public.work_requests(org_id, requested_by, request_date DESC);

-- Assigned-by-me work orders
CREATE INDEX IF NOT EXISTS idx_manual_wo_org_created_by_status_created
  ON public.manual_work_orders(org_id, created_by, status, created_at DESC);

-- Employee login resolve (ilike email)
CREATE INDEX IF NOT EXISTS idx_org_employees_email_trgm
  ON public.org_employees USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_equipment_qr_code_trgm
  ON public.equipment USING gin (qr_code gin_trgm_ops);

-- Vendor FK added in 61 without a constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manual_work_orders_vendor_id_fkey'
  ) THEN
    ALTER TABLE public.manual_work_orders
      ADD CONSTRAINT manual_work_orders_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_manual_wo_vendor_id
  ON public.manual_work_orders(vendor_id)
  WHERE vendor_id IS NOT NULL;
