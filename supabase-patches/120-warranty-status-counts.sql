-- QUERY NAME: 120-warranty-status-counts — Warranty status bucket counts for dashboard
-- MMS PRO patch | Safe to re-run | Apply after 119-report-schedule-email-body-len.sql
-- Matches client/server warrantyBucket(): missing end → out_of_warranty; end < today → expired;
-- end within next 30 days → expiring_soon; else in_warranty.

CREATE OR REPLACE FUNCTION public.org_warranty_status_counts(
  p_org_id uuid,
  p_now date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH buckets AS (
    SELECT
      CASE
        WHEN w.warranty_end IS NULL THEN 'out_of_warranty'
        WHEN w.warranty_end < p_now THEN 'expired'
        WHEN w.warranty_end <= (p_now + 30) THEN 'expiring_soon'
        ELSE 'in_warranty'
      END AS bucket
    FROM public.warranties w
    WHERE w.org_id = p_org_id
  )
  SELECT json_build_object(
    'in_warranty', COALESCE((SELECT count(*)::int FROM buckets WHERE bucket = 'in_warranty'), 0),
    'out_of_warranty', COALESCE((SELECT count(*)::int FROM buckets WHERE bucket = 'out_of_warranty'), 0),
    'expiring_soon', COALESCE((SELECT count(*)::int FROM buckets WHERE bucket = 'expiring_soon'), 0),
    'expired', COALESCE((SELECT count(*)::int FROM buckets WHERE bucket = 'expired'), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.org_warranty_status_counts(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_warranty_status_counts(uuid, date) TO service_role;
