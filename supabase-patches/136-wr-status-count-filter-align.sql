-- QUERY NAME: 136-wr-status-count-filter-align — Align WR status counts with list scope
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 135-org-status-phase-maps.sql
-- Incoming/outgoing without a department match the empty tab badge (no rows),
-- same as listWorkRequests scoping.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.count_work_request_effective_statuses(
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
  SELECT COALESCE(json_agg(json_build_object('status', s.status, 'count', s.count) ORDER BY s.status), '[]'::json)
  FROM (
    SELECT
      public.work_request_effective_status(wr.status, wr.execution_status) AS status,
      count(*)::int AS count
    FROM public.work_requests wr
    WHERE wr.org_id = p_org_id
      AND (
        -- Incoming/outgoing require a department; otherwise the queue is empty.
        CASE
          WHEN p_filter IN ('incoming', 'outgoing') AND p_department_id IS NULL THEN FALSE
          WHEN p_filter IS NULL OR p_filter = 'all' THEN TRUE
          WHEN p_filter = 'my' THEN p_profile_id IS NOT NULL AND wr.requested_by = p_profile_id
          WHEN p_filter = 'outgoing' THEN wr.order_from_department_id = p_department_id
          WHEN p_filter = 'incoming' THEN wr.order_to_department_id = p_department_id
          WHEN p_filter = 'drafts' THEN wr.status = 'draft'
          ELSE FALSE
        END
      )
      AND (
        p_filter = 'drafts'
        OR p_filter = 'my'
        OR public.work_request_matches_location(
          p_org_id,
          p_location_id,
          wr.order_from_department_id,
          wr.order_to_department_id,
          wr.equipment_id
        )
      )
      AND (
        p_filter = 'drafts'
        OR wr.status IS DISTINCT FROM 'draft'
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR wr.request_number ILIKE '%' || btrim(p_search) || '%'
        OR wr.short_description ILIKE '%' || btrim(p_search) || '%'
        OR wr.status ILIKE '%' || btrim(p_search) || '%'
      )
    GROUP BY 1
  ) s
$$;

COMMENT ON FUNCTION public.count_work_request_effective_statuses IS
  'WR list status_counts keyed like the Status column; incoming/outgoing empty without department.';
