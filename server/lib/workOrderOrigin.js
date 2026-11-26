/** PM scheduled WOs belong only on Scheduled until converted to a regular source. */
export const SCHEDULED_WO_SOURCE = 'preventive_maintenance'

/** True manual origin — created/imported as manual, not from WR or PM. */
export const MANUAL_WO_SOURCE = 'manual'

/** After completion, only a company admin may mutate the work order. */
export const WORK_ORDER_ADMIN_ONLY_STATUSES = new Set(['completed', 'verified', 'closed'])

export function isScheduledWorkOrder(row) {
  return row?.source_type === SCHEDULED_WO_SOURCE
}

export function isManualOriginWorkOrder(row) {
  return row?.source_type === MANUAL_WO_SOURCE
}

export function isWorkOrderAdminOnlyStatus(status) {
  return WORK_ORDER_ADMIN_ONLY_STATUSES.has(String(status || ''))
}

/** Non-admins cannot edit content once the WO is completed / verified / closed. */
export function canEditWorkOrderContent({ status, isOrgAdmin = false } = {}) {
  if (!isWorkOrderAdminOnlyStatus(status)) return true
  return Boolean(isOrgAdmin)
}

export function assertCanEditWorkOrderContent({ status, isOrgAdmin = false } = {}) {
  if (canEditWorkOrderContent({ status, isOrgAdmin })) return
  const err = new Error('Only a company admin can edit a completed work order.')
  err.status = 403
  throw err
}

/** Received / Assigned lists: everything except PM scheduled. */
export function excludeScheduledWorkOrders(query) {
  return query.neq('source_type', SCHEDULED_WO_SOURCE)
}

/** Manual tab: only WOs whose origin is manual (excludes WR-converted and PM). */
export function onlyManualOriginWorkOrders(query) {
  return query.eq('source_type', MANUAL_WO_SOURCE)
}
