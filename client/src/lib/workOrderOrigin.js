/** After completion, only a company admin may mutate the work order. */
export const WORK_ORDER_ADMIN_ONLY_STATUSES = new Set(['completed', 'verified', 'closed'])

export function isWorkOrderAdminOnlyStatus(status) {
  return WORK_ORDER_ADMIN_ONLY_STATUSES.has(String(status || ''))
}

/** Non-admins cannot edit content once the WO is completed / verified / closed. */
export function canEditWorkOrderContent({ status, isOrgAdmin = false } = {}) {
  if (!isWorkOrderAdminOnlyStatus(status)) return true
  return Boolean(isOrgAdmin)
}
