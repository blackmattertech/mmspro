-- QUERY NAME: 63-dashboard-stats — Work order dashboard aggregations RPC
-- MMS PRO patch | Safe to re-run | Apply after 62-performance-indexes-3.sql
-- Replaces N+1 dashboard count queries with one grouped scan.

CREATE INDEX IF NOT EXISTS idx_manual_wo_org_loc_created
  ON public.manual_work_orders(org_id, assigned_location_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.work_order_dashboard_stats(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH filtered AS MATERIALIZED (
  SELECT
    id,
    status,
    wo_number,
    created_at,
    updated_at,
    created_by,
    assigned_location_id,
    problem_description
  FROM public.manual_work_orders
  WHERE org_id = p_org_id
    AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to IS NULL OR created_at <= p_date_to)
),
scoped AS MATERIALIZED (
  SELECT assigned_location_id, created_at
  FROM public.manual_work_orders
  WHERE org_id = p_org_id
    AND (p_location_id IS NULL OR assigned_location_id = p_location_id)
)
SELECT json_build_object(
  'by_status', COALESCE((
    SELECT json_agg(json_build_object('status', s.status, 'count', s.count))
    FROM (
      SELECT status, count(*)::int AS count
      FROM filtered
      GROUP BY status
    ) s
  ), '[]'::json),
  'by_location', COALESCE((
    SELECT json_agg(json_build_object(
      'assigned_location_id', l.assigned_location_id,
      'count', l.count
    ))
    FROM (
      SELECT assigned_location_id, count(*)::int AS count
      FROM filtered
      GROUP BY assigned_location_id
    ) l
  ), '[]'::json),
  'last30', (
    SELECT count(*)::int
    FROM scoped
    WHERE created_at >= (now() - interval '30 days')
  ),
  'prev30', (
    SELECT count(*)::int
    FROM scoped
    WHERE created_at >= (now() - interval '60 days')
      AND created_at < (now() - interval '30 days')
  ),
  'trend', COALESCE((
    SELECT json_agg(json_build_object('day', t.day, 'count', t.count) ORDER BY t.day)
    FROM (
      SELECT
        (d::date)::text AS day,
        count(s.created_at)::int AS count
      FROM generate_series(
        ((timezone('utc', now()))::date - 6),
        (timezone('utc', now()))::date,
        interval '1 day'
      ) AS d
      LEFT JOIN scoped s
        ON s.created_at >= timezone('utc', d::timestamp)
       AND s.created_at < timezone('utc', (d::date + 1)::timestamp)
      GROUP BY d
    ) t
  ), '[]'::json),
  'recent', COALESCE((
    SELECT json_agg(row_to_json(r))
    FROM (
      SELECT
        id,
        status,
        wo_number,
        created_at,
        updated_at,
        created_by,
        assigned_location_id,
        problem_description
      FROM filtered
      ORDER BY created_at DESC
      LIMIT 10
    ) r
  ), '[]'::json)
);
$$;

REVOKE ALL ON FUNCTION public.work_order_dashboard_stats(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_order_dashboard_stats(uuid, uuid, timestamptz, timestamptz) TO service_role;
