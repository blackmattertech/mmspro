const FALLBACK_STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Approval Pending',
  accepted: 'Accepted',
  started: 'Started',
  in_progress: 'In Progress',
  waiting_material: 'Waiting Material',
  waiting_shutdown: 'Waiting Shutdown',
  on_hold: 'On Hold',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  returned_rework: 'Returned for Rework',
}

function hasAssignedTechnicians(order) {
  const lists = [
    order?.assignees,
    order?.assigned_technicians,
    order?.work_request?.assigned_technicians,
  ]
  return lists.some((rows) => (
    Array.isArray(rows) && rows.some((row) => row?.id || row?.employee_id || row?.name)
  ))
}

/** Display label for a work-order status, including assignee-aware "assigned" wording. */
export function formatWorkOrderStatusLabel(orderOrStatus, labelByKey = null) {
  const order = orderOrStatus && typeof orderOrStatus === 'object'
    ? orderOrStatus
    : { status: orderOrStatus }
  const status = String(order?.status || '').trim()
  if (!status) return '—'

  if (status === 'assigned') {
    return hasAssignedTechnicians(order) ? 'Technician assigned' : 'Approval Pending'
  }

  if (labelByKey?.[status]) return labelByKey[status]
  return FALLBACK_STATUS_LABELS[status] || status.replace(/_/g, ' ')
}
