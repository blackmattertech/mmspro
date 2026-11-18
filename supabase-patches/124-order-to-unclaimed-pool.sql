-- QUERY NAME: 124-order-to-unclaimed-pool — Scope unclaimed WR WOs to Order To / location-only
-- Safe to re-run.
-- Replaces the org-wide unclaimed branch from 109-open-work-order-pool.sql.
-- Unclaimed work-request orders are visible to:
--   * assignees
--   * Order To department members (assigned_department_id match)
--   * employees at the assigned location when no department is set (location-only pool)
--   * location heads of the assigned location (non-outgoing)
-- Order From people no longer see every unclaimed WO in Received.

CREATE OR REPLACE FUNCTION public.received_work_order_visible(
  p_org_id uuid,
  p_profile_id uuid,
  p_employee_id uuid,
  p_department_id uuid,
  p_location_id uuid,
  p_is_location_head boolean,
  p_created_by uuid,
  p_requester_id uuid,
  p_work_order_id uuid,
  p_work_request_id uuid,
  p_status text,
  p_assigned_department_id uuid,
  p_assigned_location_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Already assigned to this employee
    EXISTS (
      SELECT 1
      FROM public.manual_work_order_assignees a
      WHERE a.org_id = p_org_id
        AND a.work_order_id = p_work_order_id
        AND a.employee_id = p_employee_id
    )
    -- Unclaimed WR pool scoped to Order To dept, or location-only (no dept)
    OR (
      p_work_request_id IS NOT NULL
      AND p_status = ANY (ARRAY['assigned', 'accepted']::text[])
      AND NOT EXISTS (
        SELECT 1
        FROM public.manual_work_order_assignees a
        WHERE a.org_id = p_org_id
          AND a.work_order_id = p_work_order_id
      )
      AND (
        (
          p_department_id IS NOT NULL
          AND p_assigned_department_id = p_department_id
          AND (
            p_location_id IS NULL
            OR p_assigned_location_id IS NULL
            OR p_assigned_location_id = p_location_id
          )
        )
        OR (
          p_assigned_department_id IS NULL
          AND p_location_id IS NOT NULL
          AND p_assigned_location_id = p_location_id
        )
      )
    )
    -- Non-outgoing: Order To dept members or location head of assigned location
    OR (
      p_created_by IS DISTINCT FROM p_profile_id
      AND p_requester_id IS DISTINCT FROM p_profile_id
      AND (
        (
          p_department_id IS NOT NULL
          AND p_assigned_department_id = p_department_id
          AND (
            p_location_id IS NULL
            OR p_assigned_location_id IS NULL
            OR p_assigned_location_id = p_location_id
          )
        )
        OR (
          COALESCE(p_is_location_head, false)
          AND p_location_id IS NOT NULL
          AND p_assigned_location_id = p_location_id
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.received_work_order_visible(
  uuid, uuid, uuid, uuid, uuid, boolean, uuid, uuid, uuid, uuid, text, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.received_work_order_visible(
  uuid, uuid, uuid, uuid, uuid, boolean, uuid, uuid, uuid, uuid, text, uuid, uuid
) TO service_role;
