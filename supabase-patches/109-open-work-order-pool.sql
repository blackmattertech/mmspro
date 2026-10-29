-- QUERY NAME: 109-open-work-order-pool — Unclaimed work-request orders in every received inbox
-- Safe to re-run. Approved work requests with no assignee are visible to every employee.

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
    EXISTS (
      SELECT 1
      FROM public.manual_work_order_assignees a
      WHERE a.org_id = p_org_id
        AND a.work_order_id = p_work_order_id
        AND a.employee_id = p_employee_id
    )
    OR (
      p_work_request_id IS NOT NULL
      AND p_status = ANY (ARRAY['assigned', 'accepted']::text[])
      AND NOT EXISTS (
        SELECT 1
        FROM public.manual_work_order_assignees a
        WHERE a.org_id = p_org_id
          AND a.work_order_id = p_work_order_id
      )
    )
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
  p_offset int DEFAULT 0,
  p_exclude_statuses text[] DEFAULT ARRAY['draft']::text[],
  p_statuses text[] DEFAULT NULL,
  p_sort text DEFAULT NULL,
  p_sort_dir text DEFAULT 'desc',
  p_filters jsonb DEFAULT NULL
)
RETURNS TABLE (id uuid, total_count bigint)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT wo.id, wo.created_at, wo.wo_number, wo.short_description, wo.status, wo.scheduled_at, wo.priority
    FROM public.manual_work_orders wo
    WHERE wo.org_id = p_org_id
      AND public.received_work_order_visible(
        p_org_id,
        p_profile_id,
        p_employee_id,
        p_department_id,
        p_location_id,
        p_is_location_head,
        wo.created_by,
        wo.requester_id,
        wo.id,
        wo.work_request_id,
        wo.status,
        wo.assigned_department_id,
        wo.assigned_location_id
      )
      AND (
        (
          p_statuses IS NOT NULL AND cardinality(p_statuses) > 0 AND wo.status = ANY (p_statuses)
        )
        OR (
          (p_statuses IS NULL OR cardinality(p_statuses) = 0)
          AND (
            p_exclude_statuses IS NULL
            OR cardinality(p_exclude_statuses) = 0
            OR wo.status <> ALL (p_exclude_statuses)
          )
          AND (
            p_status IS NULL OR p_status = 'all'
            OR (p_status = 'open' AND wo.status = ANY (ARRAY[
              'assigned', 'accepted', 'started', 'in_progress',
              'waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'
            ]::text[]))
            OR (p_status = 'inbox' AND wo.status = ANY (ARRAY[
              'assigned', 'accepted', 'started', 'in_progress',
              'waiting_material', 'waiting_shutdown', 'on_hold',
              'completed', 'verified', 'closed', 'returned_rework'
            ]::text[]))
            OR (p_status = 'created' AND wo.status = 'assigned')
            OR wo.status = p_status
          )
        )
      )
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR wo.wo_number ILIKE '%' || btrim(p_search) || '%'
        OR wo.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wo.problem_description ILIKE '%' || btrim(p_search) || '%'
      )
      AND (
        p_filters IS NULL
        OR (
          (NULLIF(p_filters->>'wo_number', '') IS NULL OR wo.wo_number ILIKE '%' || (p_filters->>'wo_number') || '%')
          AND (NULLIF(p_filters->>'summary', '') IS NULL OR COALESCE(wo.short_description, '') ILIKE '%' || (p_filters->>'summary') || '%')
          AND (NULLIF(p_filters->>'status', '') IS NULL OR wo.status ILIKE '%' || (p_filters->>'status') || '%')
          AND (NULLIF(p_filters->>'priority', '') IS NULL OR COALESCE(wo.priority, '') ILIKE '%' || (p_filters->>'priority') || '%')
          AND (
            NULLIF(p_filters->>'work_request', '') IS NULL
            OR EXISTS (
              SELECT 1 FROM public.work_requests wr
              WHERE wr.id = wo.work_request_id
                AND wr.request_number ILIKE '%' || (p_filters->>'work_request') || '%'
            )
          )
        )
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER()::bigint AS total_count
    FROM filtered f
  )
  SELECT c.id, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'wo_number' AND p_sort_dir = 'asc' THEN c.wo_number END ASC NULLS LAST,
    CASE WHEN p_sort = 'wo_number' AND p_sort_dir = 'desc' THEN c.wo_number END DESC NULLS LAST,
    CASE WHEN p_sort = 'summary' AND p_sort_dir = 'asc' THEN c.short_description END ASC NULLS LAST,
    CASE WHEN p_sort = 'summary' AND p_sort_dir = 'desc' THEN c.short_description END DESC NULLS LAST,
    CASE WHEN p_sort = 'status' AND p_sort_dir = 'asc' THEN c.status END ASC NULLS LAST,
    CASE WHEN p_sort = 'status' AND p_sort_dir = 'desc' THEN c.status END DESC NULLS LAST,
    CASE WHEN p_sort = 'priority' AND p_sort_dir = 'asc' THEN c.priority END ASC NULLS LAST,
    CASE WHEN p_sort = 'priority' AND p_sort_dir = 'desc' THEN c.priority END DESC NULLS LAST,
    CASE WHEN p_sort = 'scheduled_at' AND p_sort_dir = 'asc' THEN c.scheduled_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'scheduled_at' AND p_sort_dir = 'desc' THEN c.scheduled_at END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' AND COALESCE(p_sort, 'created_at') IN ('created_at', 'received_at', '') THEN c.created_at END ASC NULLS LAST,
    c.created_at DESC
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
  p_status text DEFAULT 'all',
  p_exclude_statuses text[] DEFAULT ARRAY['draft']::text[]
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.manual_work_orders wo
  WHERE wo.org_id = p_org_id
    AND public.received_work_order_visible(
        p_org_id,
        p_profile_id,
        p_employee_id,
        p_department_id,
        p_location_id,
        p_is_location_head,
        wo.created_by,
        wo.requester_id,
        wo.id,
        wo.work_request_id,
        wo.status,
        wo.assigned_department_id,
        wo.assigned_location_id
      )
    AND (
      p_status IS NULL OR p_status = 'all'
      OR (p_status = 'open' AND wo.status = ANY (ARRAY[
        'assigned', 'accepted', 'started', 'in_progress',
        'waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'
      ]::text[]))
      OR (p_status = 'inbox' AND wo.status = ANY (ARRAY[
        'assigned', 'accepted', 'started', 'in_progress',
        'waiting_material', 'waiting_shutdown', 'on_hold',
        'completed', 'verified', 'closed', 'returned_rework'
      ]::text[]))
      OR (p_status = 'created' AND wo.status = 'assigned')
      OR wo.status = p_status
    )
    AND (
      p_exclude_statuses IS NULL
      OR cardinality(p_exclude_statuses) = 0
      OR wo.status <> ALL (p_exclude_statuses)
    );
$$;

CREATE OR REPLACE FUNCTION public.count_visible_received_work_orders_by_status(
  p_org_id uuid,
  p_profile_id uuid,
  p_employee_id uuid,
  p_department_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_is_location_head boolean DEFAULT false,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(json_build_object('status', s.status, 'count', s.count)), '[]'::json)
  FROM (
    SELECT wo.status, count(*)::int AS count
    FROM public.manual_work_orders wo
    WHERE wo.org_id = p_org_id
      AND public.received_work_order_visible(
        p_org_id,
        p_profile_id,
        p_employee_id,
        p_department_id,
        p_location_id,
        p_is_location_head,
        wo.created_by,
        wo.requester_id,
        wo.id,
        wo.work_request_id,
        wo.status,
        wo.assigned_department_id,
        wo.assigned_location_id
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR wo.wo_number ILIKE '%' || btrim(p_search) || '%'
        OR wo.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wo.problem_description ILIKE '%' || btrim(p_search) || '%'
      )
    GROUP BY wo.status
  ) s;
$$;
