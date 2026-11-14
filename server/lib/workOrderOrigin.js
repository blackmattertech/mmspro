/** PM scheduled WOs belong only on Scheduled until converted to a regular source. */
export const SCHEDULED_WO_SOURCE = 'preventive_maintenance'

/** True manual origin — created/imported as manual, not from WR or PM. */
export const MANUAL_WO_SOURCE = 'manual'

export function isScheduledWorkOrder(row) {
  return row?.source_type === SCHEDULED_WO_SOURCE
}

export function isManualOriginWorkOrder(row) {
  return row?.source_type === MANUAL_WO_SOURCE
}

/** Received / Assigned lists: everything except PM scheduled. */
export function excludeScheduledWorkOrders(query) {
  return query.neq('source_type', SCHEDULED_WO_SOURCE)
}

/** Manual tab: only WOs whose origin is manual (excludes WR-converted and PM). */
export function onlyManualOriginWorkOrders(query) {
  return query.eq('source_type', MANUAL_WO_SOURCE)
}
