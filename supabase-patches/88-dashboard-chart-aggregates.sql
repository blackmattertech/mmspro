-- QUERY NAME: 88-dashboard-chart-aggregates — Org dashboard chart and KPI aggregates
-- MMS PRO patch | Safe to re-run | Apply after 87-subscription-signup.sql
-- One org-scoped read for chart trends, breakdowns, priorities, overdue, warranty, and calendar counts.

CREATE OR REPLACE FUNCTION public.dashboard_pm_frequency_key(
  p_working_shift text,
  p_schedule_type text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  unit text;
BEGIN
  IF p_working_shift IS NOT NULL AND left(p_working_shift, 15) = 'pm_schedule_v1:' THEN
    BEGIN
      unit := (substring(p_working_shift FROM 16))::json ->> 'calendar_unit';
    EXCEPTION WHEN others THEN
      unit := NULL;
    END;
    IF unit IN ('day', 'week', 'month', 'quarter', 'half_yearly', 'yearly', 'reading') THEN
      RETURN unit;
    END IF;
  END IF;

  RETURN CASE p_schedule_type
    WHEN 'daily' THEN 'day'
    WHEN 'weekly' THEN 'week'
    WHEN 'monthly' THEN 'month'
    WHEN 'quarterly' THEN 'quarter'
    WHEN 'half_yearly' THEN 'half_yearly'
    WHEN 'yearly' THEN 'yearly'
    WHEN 'reading' THEN 'reading'
    WHEN 'runtime' THEN 'reading'
    WHEN 'meter' THEN 'reading'
    ELSE 'month'
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_pm_frequency_key(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.org_dashboard_chart_aggregates(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_pm_from timestamptz DEFAULT NULL,
  p_pm_to timestamptz DEFAULT NULL,
  p_calendar_from date DEFAULT NULL,
  p_calendar_to date DEFAULT NULL,
  p_now timestamptz DEFAULT now(),
  p_tz text DEFAULT 'UTC'
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT json_build_object(
  'source', 'chart',
  'work_requests', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM public.work_requests
      WHERE org_id = p_org_id
        AND (p_date_from IS NULL OR created_at >= p_date_from)
        AND (p_date_to IS NULL OR created_at <= p_date_to)
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
        AND (p_date_from IS NULL OR created_at >= p_date_from)
        AND (p_date_to IS NULL OR created_at <= p_date_to)
      GROUP BY status
    ) s
  ), '[]'::json),
  'wo_kpis', (
    SELECT json_build_object(
      'manual', (count(*) FILTER (WHERE source_type = 'manual'))::int,
      'scheduled', (count(*) FILTER (WHERE source_type = 'preventive_maintenance'))::int,
      'open', (count(*) FILTER (WHERE status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])))::int,
      'high', (count(*) FILTER (WHERE priority = 'high'))::int,
      'medium', (count(*) FILTER (WHERE priority = 'medium'))::int,
      'low', (count(*) FILTER (WHERE priority = 'low'))::int,
      'overdue', (count(*) FILTER (WHERE
        status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])
        AND (
          (planned_end_at IS NOT NULL AND planned_end_at < p_now)
          OR (scheduled_at IS NOT NULL AND scheduled_at < p_now)
        )
      ))::int
    )
    FROM public.manual_work_orders
    WHERE org_id = p_org_id
      AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to)
  ),
  'pm_plans', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM public.pm_plans
      WHERE org_id = p_org_id
        AND (p_location_id IS NULL OR location_id = p_location_id)
        AND (p_pm_from IS NULL OR next_due_at >= p_pm_from)
        AND (p_pm_to IS NULL OR next_due_at <= p_pm_to)
      GROUP BY status
    ) s
  ), '[]'::json),
  'tasks', COALESCE((
    SELECT json_agg(json_build_object('status_id', s.status_id, 'count', s.count))
    FROM (
      SELECT status_id, count(*)::int AS count
      FROM public.tasks
      WHERE org_id = p_org_id
        AND (p_date_from IS NULL OR created_at >= p_date_from)
        AND (p_date_to IS NULL OR created_at <= p_date_to)
      GROUP BY status_id
    ) s
  ), '[]'::json),
  'daily', json_build_object(
    'work_orders', COALESCE((
      SELECT json_agg(json_build_object(
        'day', d.day,
        'total', d.total,
        'open', d.open,
        'in_progress', d.in_progress,
        'completed', d.completed,
        'overdue', d.overdue
      ) ORDER BY d.day)
      FROM (
        SELECT
          to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
          count(*)::int AS total,
          (count(*) FILTER (WHERE status = ANY (ARRAY['draft', 'assigned', 'accepted']::text[])))::int AS open,
          (count(*) FILTER (WHERE status = 'in_progress'))::int AS in_progress,
          (count(*) FILTER (WHERE status = ANY (ARRAY['completed', 'verified', 'closed']::text[])))::int AS completed,
          (count(*) FILTER (WHERE
            status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])
            AND COALESCE(planned_end_at, scheduled_at) IS NOT NULL
            AND COALESCE(planned_end_at, scheduled_at) < p_now
          ))::int AS overdue
        FROM public.manual_work_orders
        WHERE org_id = p_org_id
          AND (p_since IS NULL OR created_at >= p_since)
          AND (p_until IS NULL OR created_at <= p_until)
          AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
        GROUP BY 1
      ) d
    ), '[]'::json),
    'work_requests', COALESCE((
      SELECT json_agg(json_build_object(
        'day', d.day,
        'total', d.total,
        'new', d.new_count,
        'under_review', d.under_review,
        'approved', d.approved,
        'rejected', d.rejected
      ) ORDER BY d.day)
      FROM (
        SELECT
          to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
          count(*)::int AS total,
          (count(*) FILTER (WHERE status = ANY (ARRAY['draft', 'submitted']::text[])))::int AS new_count,
          (count(*) FILTER (WHERE status = ANY (ARRAY['pending_approval', 'need_info', 'info_provided']::text[])))::int AS under_review,
          (count(*) FILTER (WHERE status = 'approved'))::int AS approved,
          (count(*) FILTER (WHERE status = 'rejected'))::int AS rejected
        FROM public.work_requests
        WHERE org_id = p_org_id
          AND (p_since IS NULL OR created_at >= p_since)
          AND (p_until IS NULL OR created_at <= p_until)
        GROUP BY 1
      ) d
    ), '[]'::json),
    'pm_plans', COALESCE((
      SELECT json_agg(json_build_object(
        'day', d.day,
        'total', d.total,
        'active', d.active,
        'overdue', d.overdue,
        'inactive', d.inactive
      ) ORDER BY d.day)
      FROM (
        SELECT
          to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
          count(*)::int AS total,
          (count(*) FILTER (WHERE status = 'active'))::int AS active,
          (count(*) FILTER (WHERE status = 'overdue'))::int AS overdue,
          (count(*) FILTER (WHERE status = 'inactive'))::int AS inactive
        FROM public.pm_plans
        WHERE org_id = p_org_id
          AND (p_since IS NULL OR created_at >= p_since)
          AND (p_until IS NULL OR created_at <= p_until)
          AND (p_location_id IS NULL OR location_id = p_location_id)
        GROUP BY 1
      ) d
    ), '[]'::json),
    'tasks', COALESCE((
      SELECT json_agg(json_build_object(
        'day', d.day,
        'total', d.total,
        'open', d.open_count,
        'done', d.done_count
      ) ORDER BY d.day)
      FROM (
        SELECT
          to_char((t.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
          count(*)::int AS total,
          (count(*) FILTER (WHERE COALESCE(ts.is_terminal, false) = false))::int AS open_count,
          (count(*) FILTER (WHERE ts.is_terminal IS TRUE))::int AS done_count
        FROM public.tasks t
        LEFT JOIN public.task_statuses ts ON ts.id = t.status_id
        WHERE t.org_id = p_org_id
          AND (p_since IS NULL OR t.created_at >= p_since)
          AND (p_until IS NULL OR t.created_at <= p_until)
          AND (p_location_id IS NULL OR t.location_id = p_location_id)
        GROUP BY 1
      ) d
    ), '[]'::json)
  ),
  'locations', COALESCE((
    SELECT json_agg(json_build_object('location_id', s.location_id, 'count', s.count))
    FROM (
      SELECT assigned_location_id AS location_id, count(*)::int AS count
      FROM public.manual_work_orders
      WHERE org_id = p_org_id
        AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
      GROUP BY assigned_location_id
    ) s
  ), '[]'::json),
  'requests', json_build_object(
    'categories', COALESCE((
      SELECT json_agg(json_build_object('name', c.name, 'count', c.count) ORDER BY c.count DESC, c.name)
      FROM (
        SELECT
          CASE
            WHEN btrim(coalesce(job_nature, '')) <> '' THEN btrim(job_nature)
            WHEN request_type = 'inter_department' THEN 'Inter-department'
            WHEN request_type = 'intra_department' THEN 'Intra-department'
            WHEN request_type = 'user_self' THEN 'Self'
            WHEN request_type = 'manual' THEN 'Manual'
            ELSE 'Unspecified'
          END AS name,
          count(*)::int AS count
        FROM public.work_requests
        WHERE org_id = p_org_id
        GROUP BY 1
        ORDER BY count DESC, name
        LIMIT 5
      ) c
    ), '[]'::json),
    'locations', COALESCE((
      SELECT json_agg(json_build_object('location_id', c.location_id, 'count', c.count))
      FROM (
        SELECT dept.location_id, count(*)::int AS count
        FROM public.work_requests wr
        LEFT JOIN public.departments dept ON dept.id = wr.order_to_department_id
        WHERE wr.org_id = p_org_id
        GROUP BY dept.location_id
      ) c
    ), '[]'::json)
  ),
  'frequency', COALESCE((
    SELECT json_agg(json_build_object('key', f.key, 'count', f.count))
    FROM (
      SELECT public.dashboard_pm_frequency_key(working_shift, schedule_type) AS key, count(*)::int AS count
      FROM public.pm_plans
      WHERE org_id = p_org_id
        AND (p_location_id IS NULL OR location_id = p_location_id)
      GROUP BY 1
    ) f
  ), '[]'::json),
  'warranties', json_build_object(
    'by_status', (
      SELECT json_build_object(
        'active', (count(*) FILTER (WHERE bucket = 'active'))::int,
        'expiring_soon', (count(*) FILTER (WHERE bucket = 'expiring_soon'))::int,
        'expired', (count(*) FILTER (WHERE bucket = 'expired'))::int
      )
      FROM (
        SELECT CASE
          WHEN w.warranty_end IS NULL THEN 'active'
          WHEN ((w.warranty_end + time '23:59:59') AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'UTC')) < p_now THEN 'expired'
          WHEN ((w.warranty_end + time '23:59:59') AT TIME ZONE COALESCE(NULLIF(p_tz, ''), 'UTC'))
            <= p_now + make_interval(days => CASE
              WHEN w.expiry_notification_days IS NULL OR w.expiry_notification_days < 0 THEN 30
              ELSE w.expiry_notification_days
            END)
            THEN 'expiring_soon'
          ELSE 'active'
        END AS bucket
        FROM public.warranties w
        WHERE w.org_id = p_org_id
      ) buckets
    ),
    'trend', COALESCE((
      SELECT json_agg(json_build_object(
        'month', t.month,
        'expiring', t.expiring,
        'expired', t.expired
      ) ORDER BY t.month)
      FROM (
        SELECT
          to_char(w.warranty_end, 'YYYY-MM') AS month,
          (count(*) FILTER (WHERE w.warranty_end >= (p_now AT TIME ZONE 'UTC')::date))::int AS expiring,
          (count(*) FILTER (WHERE w.warranty_end < (p_now AT TIME ZONE 'UTC')::date))::int AS expired
        FROM public.warranties w
        WHERE w.org_id = p_org_id
          AND w.warranty_end IS NOT NULL
          AND w.warranty_end >= (date_trunc('month', (p_now AT TIME ZONE 'UTC'))::date - interval '5 months')
          AND w.warranty_end < (date_trunc('month', (p_now AT TIME ZONE 'UTC'))::date + interval '1 month')
        GROUP BY 1
      ) t
    ), '[]'::json),
    'vendors', COALESCE((
      SELECT json_agg(json_build_object('name', v.name, 'count', v.count) ORDER BY v.count DESC, v.name)
      FROM (
        SELECT name, count(*)::int AS count
        FROM (
          SELECT COALESCE(NULLIF(btrim(vendor.name), ''), NULLIF(btrim(w.vendor), '')) AS name
          FROM public.warranties w
          LEFT JOIN public.vendors vendor ON vendor.id = w.vendor_id
          WHERE w.org_id = p_org_id
        ) named
        WHERE name IS NOT NULL
        GROUP BY name
        ORDER BY count DESC, name
        LIMIT 5
      ) v
    ), '[]'::json)
  ),
  'calendar', json_build_object(
    'task', (
      SELECT count(*)::int
      FROM public.tasks
      WHERE org_id = p_org_id
        AND due_date IS NOT NULL
        AND (p_calendar_from IS NULL OR due_date >= p_calendar_from)
        AND (p_calendar_to IS NULL OR due_date <= p_calendar_to)
        AND (p_location_id IS NULL OR location_id = p_location_id)
    ),
    'work_order', (
      SELECT count(*)::int
      FROM public.manual_work_orders
      WHERE org_id = p_org_id
        AND status <> 'cancelled'
        AND COALESCE(planned_end_at, scheduled_at, planned_start_at) IS NOT NULL
        AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
        AND (p_calendar_from IS NULL OR ((COALESCE(planned_end_at, scheduled_at, planned_start_at) AT TIME ZONE 'UTC')::date) >= p_calendar_from)
        AND (p_calendar_to IS NULL OR ((COALESCE(planned_end_at, scheduled_at, planned_start_at) AT TIME ZONE 'UTC')::date) <= p_calendar_to)
    ),
    'work_request', (
      SELECT count(*)::int
      FROM public.work_requests wr
      LEFT JOIN public.equipment eq ON eq.id = wr.equipment_id
      LEFT JOIN public.departments dept ON dept.id = wr.order_to_department_id
      WHERE wr.org_id = p_org_id
        AND wr.status <> 'cancelled'
        AND wr.request_date IS NOT NULL
        AND (p_calendar_from IS NULL OR wr.request_date >= p_calendar_from::timestamp)
        AND (p_calendar_to IS NULL OR wr.request_date <= (p_calendar_to::timestamp + time '23:59:59'))
        AND (
          p_location_id IS NULL
          OR COALESCE(eq.location_id, dept.location_id) = p_location_id
        )
    ),
    'pm_plan', (
      SELECT count(*)::int
      FROM public.pm_plans
      WHERE org_id = p_org_id
        AND next_due_at IS NOT NULL
        AND status <> 'inactive'
        AND (p_location_id IS NULL OR location_id = p_location_id)
        AND (p_calendar_from IS NULL OR next_due_at >= p_calendar_from)
        AND (p_calendar_to IS NULL OR next_due_at <= p_calendar_to)
    ),
    'warranty', (
      SELECT count(*)::int
      FROM public.warranties
      WHERE org_id = p_org_id
        AND warranty_end IS NOT NULL
        AND (p_calendar_from IS NULL OR warranty_end >= p_calendar_from)
        AND (p_calendar_to IS NULL OR warranty_end <= p_calendar_to)
    )
  ),
  'assets', json_build_object(
    'total', (
      SELECT count(*)::int
      FROM public.equipment e
      WHERE e.org_id = p_org_id
        AND (p_location_id IS NULL OR e.location_id = p_location_id)
    ),
    'operational', (
      SELECT count(*)::int
      FROM public.equipment e
      WHERE e.org_id = p_org_id
        AND (p_location_id IS NULL OR e.location_id = p_location_id)
        AND e.is_active IS NOT FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM public.manual_work_orders wo
          WHERE wo.org_id = p_org_id
            AND wo.equipment_id = e.id
            AND wo.status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])
            AND (p_location_id IS NULL OR wo.assigned_location_id = p_location_id)
        )
    ),
    'maintenance', (
      SELECT count(*)::int
      FROM public.equipment e
      WHERE e.org_id = p_org_id
        AND (p_location_id IS NULL OR e.location_id = p_location_id)
        AND EXISTS (
          SELECT 1
          FROM public.manual_work_orders wo
          WHERE wo.org_id = p_org_id
            AND wo.equipment_id = e.id
            AND wo.status = ANY (ARRAY['assigned', 'accepted', 'in_progress']::text[])
            AND (p_location_id IS NULL OR wo.assigned_location_id = p_location_id)
        )
    ),
    'inactive', (
      SELECT count(*)::int
      FROM public.equipment e
      WHERE e.org_id = p_org_id
        AND (p_location_id IS NULL OR e.location_id = p_location_id)
        AND e.is_active IS FALSE
    ),
    'departments', COALESCE((
      SELECT json_agg(json_build_object('name', d.name, 'count', d.count) ORDER BY d.count DESC, d.name)
      FROM (
        SELECT COALESCE(dep.name, 'Unassigned') AS name, count(*)::int AS count
        FROM public.equipment e
        LEFT JOIN public.departments dep ON dep.id = e.department_id
        WHERE e.org_id = p_org_id
          AND (p_location_id IS NULL OR e.location_id = p_location_id)
        GROUP BY 1
        ORDER BY count DESC, name
        LIMIT 5
      ) d
    ), '[]'::json),
    'locations', COALESCE((
      SELECT json_agg(json_build_object('name', d.name, 'count', d.count) ORDER BY d.count DESC, d.name)
      FROM (
        SELECT COALESCE(loc.name, 'Unassigned') AS name, count(*)::int AS count
        FROM public.equipment e
        LEFT JOIN public.org_locations loc ON loc.id = e.location_id
        WHERE e.org_id = p_org_id
          AND (p_location_id IS NULL OR e.location_id = p_location_id)
        GROUP BY 1
        ORDER BY count DESC, name
        LIMIT 5
      ) d
    ), '[]'::json)
  )
);
$$;

REVOKE ALL ON FUNCTION public.org_dashboard_chart_aggregates(
  uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, date, date, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_dashboard_chart_aggregates(
  uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, date, date, timestamptz, text
) TO service_role;
