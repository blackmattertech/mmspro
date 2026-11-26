-- QUERY NAME: 137-scwo-prefix-scheduled-work-orders — SCWO prefix for PM scheduled WOs
-- Rewrites legacy WO-… numbers on preventive_maintenance work orders to SCWO-….

update public.manual_work_orders
set wo_number = 'SCWO-' || substr(wo_number, 4)
where source_type = 'preventive_maintenance'
  and wo_number is not null
  and wo_number ~ '^WO-';
