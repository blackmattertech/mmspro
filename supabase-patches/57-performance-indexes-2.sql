-- QUERY NAME: 57-performance-indexes-2 — Additional performance indexes

-- Received work order routing
CREATE INDEX IF NOT EXISTS idx_manual_wo_org_status_loc
  ON manual_work_orders(org_id, status, assigned_location_id)
  WHERE assigned_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_wo_org_status_dept
  ON manual_work_orders(org_id, status, assigned_department_id)
  WHERE assigned_department_id IS NOT NULL;

-- Work request list ordering
CREATE INDEX IF NOT EXISTS idx_work_requests_org_request_date
  ON work_requests(org_id, request_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_requests_equipment
  ON work_requests(equipment_id)
  WHERE equipment_id IS NOT NULL;

-- Task list default sort
CREATE INDEX IF NOT EXISTS idx_tasks_org_template_updated
  ON tasks(org_id, is_recurrence_template, updated_at DESC);

-- Push notification lookups
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id
  ON fcm_tokens(user_id);

-- Warranty expiry filters
CREATE INDEX IF NOT EXISTS idx_warranties_org_warranty_end
  ON warranties(org_id, warranty_end);
