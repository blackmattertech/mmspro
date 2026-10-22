-- QUERY NAME: 83-performance-aggregations — Home dashboard + received WO status + admin org usage RPCs
-- MMS PRO patch | Safe to re-run | Apply after 82-warranty-item-terms.sql
-- Collapses N COUNT / full-row status tallies into grouped RPCs.

CREATE OR REPLACE FUNCTION public.org_home_dashboard_status_counts(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT json_build_object(
  'work_requests', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM public.work_requests
      WHERE org_id = p_org_id
      GROUP BY status
    ) s
  ), '[]'::json),
  'work_orders', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM public.manual_work_orders
      WHERE org_id = p_org_id
        AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
      GROUP BY status
    ) s
  ), '[]'::json),
  'work_orders_manual', (
    SELECT count(*)::int
    FROM public.manual_work_orders
    WHERE org_id = p_org_id
      AND source_type = 'manual'
      AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
  ),
  'work_orders_scheduled', (
    SELECT count(*)::int
    FROM public.manual_work_orders
    WHERE org_id = p_org_id
      AND source_type = 'preventive_maintenance'
      AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
  ),
  'work_orders_open', (
    SELECT count(*)::int
    FROM public.manual_work_orders
    WHERE org_id = p_org_id
      AND status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])
      AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
  ),
  'pm_plans', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM public.pm_plans
      WHERE org_id = p_org_id
        AND (p_location_id IS NULL OR location_id = p_location_id)
      GROUP BY status
    ) s
  ), '[]'::json),
  'tasks', COALESCE((
    SELECT json_agg(json_build_object('status_id', s.status_id, 'count', s.count))
    FROM (
      SELECT status_id, count(*)::int AS count
      FROM public.tasks
      WHERE org_id = p_org_id
      GROUP BY status_id
    ) s
  ), '[]'::json)
);
$$;

REVOKE ALL ON FUNCTION public.org_home_dashboard_status_counts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_home_dashboard_status_counts(uuid, uuid) TO service_role;

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
        p_search IS NULL
        OR btrim(p_search) = ''
        OR wo.wo_number ILIKE '%' || btrim(p_search) || '%'
        OR wo.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wo.problem_description ILIKE '%' || btrim(p_search) || '%'
      )
    GROUP BY wo.status
  ) s;
$$;

REVOKE ALL ON FUNCTION public.count_visible_received_work_orders_by_status(
  uuid, uuid, uuid, uuid, uuid, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_visible_received_work_orders_by_status(
  uuid, uuid, uuid, uuid, uuid, boolean, text
) TO service_role;

-- Admin Organizations list: one grouped scan instead of N×4 usage queries
CREATE OR REPLACE FUNCTION public.admin_org_usage_counts(p_org_ids uuid[])
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(COALESCE(p_org_ids, ARRAY[]::uuid[])) AS org_id
  ),
  loc AS (
    SELECT org_id, count(*)::int AS locations
    FROM public.org_locations
    WHERE org_id = ANY (p_org_ids)
      AND is_active = true
    GROUP BY org_id
  ),
  dept AS (
    SELECT org_id, count(*)::int AS departments
    FROM public.departments
    WHERE org_id = ANY (p_org_ids)
      AND is_active = true
    GROUP BY org_id
  ),
  emp AS (
    SELECT org_id, count(*)::int AS employees
    FROM public.org_employees
    WHERE org_id = ANY (p_org_ids)
      AND is_active = true
    GROUP BY org_id
  ),
  logins AS (
    SELECT org_id, count(*)::int AS logins
    FROM public.profiles
    WHERE org_id = ANY (p_org_ids)
    GROUP BY org_id
  )
  SELECT COALESCE(
    json_object_agg(
      i.org_id::text,
      json_build_object(
        'locations', COALESCE(loc.locations, 0),
        'departments', COALESCE(dept.departments, 0),
        'employees', COALESCE(emp.employees, 0),
        'logins', COALESCE(logins.logins, 0)
      )
    ),
    '{}'::json
  )
  FROM ids i
  LEFT JOIN loc ON loc.org_id = i.org_id
  LEFT JOIN dept ON dept.org_id = i.org_id
  LEFT JOIN emp ON emp.org_id = i.org_id
  LEFT JOIN logins ON logins.org_id = i.org_id;
$$;

REVOKE ALL ON FUNCTION public.admin_org_usage_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_org_usage_counts(uuid[]) TO service_role;
