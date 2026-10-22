-- QUERY NAME: 102-list-status-aggregates — WR/WO status GROUP BY + list indexes
-- MMS PRO patch | Safe to re-run | Apply after 101-checklist-form-map.sql
-- Replaces N HEAD COUNTs / full-table status paging with grouped RPCs and EXISTS location scope.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_work_requests_org_status_request_date
  ON public.work_requests (org_id, status, request_date DESC);

CREATE INDEX IF NOT EXISTS idx_manual_wo_org_status_planned_end
  ON public.manual_work_orders (org_id, status, planned_end_at)
  WHERE planned_end_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_wo_org_status_scheduled
  ON public.manual_work_orders (org_id, status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_requests_request_number_trgm
  ON public.work_requests USING gin (request_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_work_requests_short_description_trgm
  ON public.work_requests USING gin (short_description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_manual_wo_number_trgm
  ON public.manual_work_orders USING gin (wo_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_manual_wo_short_description_trgm
  ON public.manual_work_orders USING gin (short_description gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.work_request_matches_location(
  p_org_id uuid,
  p_location_id uuid,
  p_from_department_id uuid,
  p_to_department_id uuid,
  p_equipment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_location_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.departments d
      WHERE d.org_id = p_org_id
        AND d.location_id = p_location_id
        AND d.id IN (p_from_department_id, p_to_department_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.equipment e
      WHERE e.org_id = p_org_id
        AND e.location_id = p_location_id
        AND e.id = p_equipment_id
    );
$$;

CREATE OR REPLACE FUNCTION public.count_work_request_statuses(
  p_org_id uuid,
  p_filter text DEFAULT 'all',
  p_profile_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
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
    SELECT wr.status, count(*)::int AS count
    FROM public.work_requests wr
    WHERE wr.org_id = p_org_id
      AND (
        p_filter IS NULL
        OR p_filter = 'all'
        OR (p_filter = 'my' AND p_profile_id IS NOT NULL AND wr.requested_by = p_profile_id)
        OR (p_filter = 'outgoing' AND p_department_id IS NOT NULL AND wr.order_from_department_id = p_department_id)
        OR (p_filter = 'incoming' AND p_department_id IS NOT NULL AND wr.order_to_department_id = p_department_id)
      )
      AND (
        p_filter = 'my'
        OR public.work_request_matches_location(
          p_org_id,
          p_location_id,
          wr.order_from_department_id,
          wr.order_to_department_id,
          wr.equipment_id
        )
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR wr.request_number ILIKE '%' || btrim(p_search) || '%'
        OR wr.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wr.status ILIKE '%' || btrim(p_search) || '%'
      )
    GROUP BY wr.status
  ) s;
$$;

REVOKE ALL ON FUNCTION public.count_work_request_statuses(uuid, text, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_work_request_statuses(uuid, text, uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.count_work_request_tabs(
  p_org_id uuid,
  p_profile_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      wr.requested_by,
      wr.order_from_department_id,
      wr.order_to_department_id
    FROM public.work_requests wr
    WHERE wr.org_id = p_org_id
      AND wr.status IS DISTINCT FROM 'draft'
  )
  SELECT json_build_object(
    'my', (
      SELECT count(*)::int
      FROM scoped
      WHERE p_profile_id IS NOT NULL AND requested_by = p_profile_id
    ),
    'incoming', (
      SELECT count(*)::int
      FROM public.work_requests wr
      WHERE wr.org_id = p_org_id
        AND wr.status IS DISTINCT FROM 'draft'
        AND p_department_id IS NOT NULL
        AND wr.order_to_department_id = p_department_id
        AND public.work_request_matches_location(
          p_org_id, p_location_id, wr.order_from_department_id, wr.order_to_department_id, wr.equipment_id
        )
    ),
    'outgoing', (
      SELECT count(*)::int
      FROM public.work_requests wr
      WHERE wr.org_id = p_org_id
        AND wr.status IS DISTINCT FROM 'draft'
        AND p_department_id IS NOT NULL
        AND wr.order_from_department_id = p_department_id
        AND public.work_request_matches_location(
          p_org_id, p_location_id, wr.order_from_department_id, wr.order_to_department_id, wr.equipment_id
        )
    ),
    'all', (
      SELECT count(*)::int
      FROM public.work_requests wr
      WHERE wr.org_id = p_org_id
        AND wr.status IS DISTINCT FROM 'draft'
        AND public.work_request_matches_location(
          p_org_id, p_location_id, wr.order_from_department_id, wr.order_to_department_id, wr.equipment_id
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.count_work_request_tabs(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_work_request_tabs(uuid, uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.count_manual_work_orders_by_status(
  p_org_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL,
  p_source_type text DEFAULT NULL,
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
      AND (p_location_id IS NULL OR wo.assigned_location_id = p_location_id)
      AND (
        p_profile_id IS NULL
        OR wo.created_by = p_profile_id
        OR wo.requester_id = p_profile_id
      )
      AND (p_source_type IS NULL OR btrim(p_source_type) = '' OR wo.source_type = p_source_type)
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

REVOKE ALL ON FUNCTION public.count_manual_work_orders_by_status(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_manual_work_orders_by_status(uuid, uuid, uuid, text, text) TO service_role;
