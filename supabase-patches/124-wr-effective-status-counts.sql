-- QUERY NAME: 124-wr-effective-status-counts — WR status counts match Status column
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 123-org-data-reset-otps.sql
-- Counts work requests by effective display status (request status, or
-- execution_status / synthetic keys after approval).
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.work_request_effective_status(
  p_status text,
  p_execution_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_status, '') IS DISTINCT FROM 'approved' THEN coalesce(nullif(btrim(p_status), ''), 'submitted')
    WHEN p_execution_status IS NULL
      OR btrim(p_execution_status) = ''
      OR p_execution_status IN ('draft', 'created') THEN 'work_order_generated'
    WHEN p_execution_status = 'assigned' THEN 'technician_assigned'
    ELSE p_execution_status
  END
$$;

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
        p_filter IS NULL
        OR p_filter = 'all'
        OR (p_filter = 'my' AND p_profile_id IS NOT NULL AND wr.requested_by = p_profile_id)
        OR (p_filter = 'outgoing' AND p_department_id IS NOT NULL AND wr.order_from_department_id = p_department_id)
        OR (p_filter = 'incoming' AND p_department_id IS NOT NULL AND wr.order_to_department_id = p_department_id)
        OR (p_filter = 'drafts' AND wr.status = 'draft')
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
  'WR list status_counts keyed like the Status column (request or WO execution/display).';
