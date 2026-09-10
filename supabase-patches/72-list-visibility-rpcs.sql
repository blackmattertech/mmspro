-- QUERY NAME: 72-list-visibility-rpcs — Paginated visibility for received WOs & assigned tasks
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 71-work-order-daily-logs.sql
-- Replaces app-side "prefetch all visible IDs" with SQL pagination.
-- ══════════════════════════════════════════════════════════════

-- Global reminder due scan (scheduler has no org_id filter)
CREATE INDEX IF NOT EXISTS idx_task_reminders_due_unsent
  ON public.task_reminders (remind_at)
  WHERE sent_at IS NULL AND remind_at IS NOT NULL;

-- PM scheduler: active plans by next due (lead-time filtered in app/SQL)
CREATE INDEX IF NOT EXISTS idx_pm_plans_active_next_due
  ON public.pm_plans (next_due_at)
  WHERE status = 'active' AND next_due_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_visible_received_work_order_ids(
  p_org_id uuid,
  p_profile_id uuid,
  p_employee_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_is_location_head boolean DEFAULT false,
  p_status text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (id uuid, total_count bigint)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT wo.id, wo.created_at
    FROM public.manual_work_orders wo
    WHERE wo.org_id = p_org_id
      AND wo.created_by IS DISTINCT FROM p_profile_id
      AND wo.requester_id IS DISTINCT FROM p_profile_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.manual_work_order_assignees a
          WHERE a.org_id = p_org_id
            AND a.work_order_id = wo.id
            AND a.employee_id = p_employee_id
        )
        OR (
          p_department_id IS NOT NULL
          AND wo.assigned_department_id = p_department_id
          AND (
            p_location_id IS NULL
            OR wo.assigned_location_id IS NULL
            OR wo.assigned_location_id = p_location_id
          )
        )
        OR (
          COALESCE(p_is_location_head, false)
          AND p_location_id IS NOT NULL
          AND wo.assigned_location_id = p_location_id
        )
      )
      AND (
        p_status IS NULL
        OR p_status = 'all'
        OR (
          p_status = 'open'
          AND wo.status = ANY (ARRAY[
            'assigned', 'accepted', 'started', 'in_progress',
            'waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'
          ]::text[])
        )
        OR (
          p_status = 'inbox'
          AND wo.status = ANY (ARRAY[
            'assigned', 'accepted', 'started', 'in_progress',
            'waiting_material', 'waiting_shutdown', 'on_hold',
            'completed', 'verified', 'closed', 'returned_rework'
          ]::text[])
        )
        OR (p_status = 'created' AND wo.status = 'assigned')
        OR wo.status = p_status
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR wo.wo_number ILIKE '%' || btrim(p_search) || '%'
        OR wo.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wo.problem_description ILIKE '%' || btrim(p_search) || '%'
      )
  ),
  counted AS (
    SELECT f.id, f.created_at, count(*) OVER()::bigint AS total_count
    FROM filtered f
  )
  SELECT c.id, c.total_count
  FROM counted c
  ORDER BY c.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.count_visible_received_work_orders(
  p_org_id uuid,
  p_profile_id uuid,
  p_employee_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_is_location_head boolean DEFAULT false,
  p_status text DEFAULT 'all'
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.manual_work_orders wo
  WHERE wo.org_id = p_org_id
    AND wo.created_by IS DISTINCT FROM p_profile_id
    AND wo.requester_id IS DISTINCT FROM p_profile_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.manual_work_order_assignees a
        WHERE a.org_id = p_org_id
          AND a.work_order_id = wo.id
          AND a.employee_id = p_employee_id
      )
      OR (
        p_department_id IS NOT NULL
        AND wo.assigned_department_id = p_department_id
        AND (
          p_location_id IS NULL
          OR wo.assigned_location_id IS NULL
          OR wo.assigned_location_id = p_location_id
        )
      )
      OR (
        COALESCE(p_is_location_head, false)
        AND p_location_id IS NOT NULL
        AND wo.assigned_location_id = p_location_id
      )
    )
    AND (
      p_status IS NULL
      OR p_status = 'all'
      OR (
        p_status = 'open'
        AND wo.status = ANY (ARRAY[
          'assigned', 'accepted', 'started', 'in_progress',
          'waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'
        ]::text[])
      )
      OR (
        p_status = 'inbox'
        AND wo.status = ANY (ARRAY[
          'assigned', 'accepted', 'started', 'in_progress',
          'waiting_material', 'waiting_shutdown', 'on_hold',
          'completed', 'verified', 'closed', 'returned_rework'
        ]::text[])
      )
      OR (p_status = 'created' AND wo.status = 'assigned')
      OR wo.status = p_status
    );
$$;
