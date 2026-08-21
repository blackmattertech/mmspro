-- QUERY NAME: 70-work-order-permit-details — Per-type permit details on WOs
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 69-work-request-job-nature.sql
-- Stores number / issue / expiry for each selected permit type.
-- Legacy permit_number / permit_issue_at / permit_expiry_at stay in sync
-- with the first detail row for older readers.
-- ══════════════════════════════════════════════════════════════

alter table public.manual_work_orders
  add column if not exists permit_details jsonb default '[]'::jsonb not null;

comment on column public.manual_work_orders.permit_details is
  'Array of { type, number, issue_at, expiry_at } for each selected permit type';

-- Backfill one detail row from legacy columns when types exist but details are empty
update public.manual_work_orders
set permit_details = jsonb_build_array(
  jsonb_build_object(
    'type', permit_types[1],
    'number', coalesce(permit_number, ''),
    'issue_at', permit_issue_at,
    'expiry_at', permit_expiry_at
  )
)
where coalesce(array_length(permit_types, 1), 0) > 0
  and (
    permit_details is null
    or permit_details = '[]'::jsonb
  )
  and (
    coalesce(permit_number, '') <> ''
    or permit_issue_at is not null
    or permit_expiry_at is not null
  );
