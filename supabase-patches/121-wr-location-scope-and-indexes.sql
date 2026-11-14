-- QUERY NAME: 121-wr-location-scope-and-indexes — WR location scope RPC + hot indexes
-- MMS PRO patch | Safe to re-run | Apply after 120-warranty-status-counts.sql
-- Replaces client-built department/equipment ID lists with a join-based id set.
-- Adds composite indexes for equipment value filters and WO-by-equipment activity.

CREATE OR REPLACE FUNCTION public.org_work_request_ids_for_location(
  p_org_id uuid,
  p_location_id uuid
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT wr.id), ARRAY[]::uuid[])
  FROM public.work_requests wr
  LEFT JOIN public.departments d_from ON d_from.id = wr.order_from_department_id
  LEFT JOIN public.departments d_to ON d_to.id = wr.order_to_department_id
  LEFT JOIN public.equipment e ON e.id = wr.equipment_id
  WHERE wr.org_id = p_org_id
    AND (
      (d_from.id IS NOT NULL AND (d_from.location_id = p_location_id OR d_from.all_locations IS TRUE))
      OR (d_to.id IS NOT NULL AND (d_to.location_id = p_location_id OR d_to.all_locations IS TRUE))
      OR (e.id IS NOT NULL AND e.location_id = p_location_id)
    );
$$;

REVOKE ALL ON FUNCTION public.org_work_request_ids_for_location(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_work_request_ids_for_location(uuid, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS equipment_values_org_field_idx
  ON public.equipment_values (org_id, field_id);

CREATE INDEX IF NOT EXISTS manual_work_orders_org_equipment_idx
  ON public.manual_work_orders (org_id, equipment_id)
  WHERE equipment_id IS NOT NULL;
