const REQUEST_FALLBACK = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  need_info: 'Need info',
  info_provided: 'Info provided',
  cancelled: 'Cancelled',
}

const WORK_ORDER_FALLBACK = {
  draft: 'Draft',
  created: 'Created',
  assigned: 'Assigned',
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

const OPEN_ASSIGNMENT_STATUSES = new Set(['draft', 'created', 'assigned'])

function pretty(status) {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function hasTechnician(row) {
  return (row?.assigned_technicians || []).some((tech) => tech?.id || tech?.employee_id || tech?.name)
}

/**
 * SQL-aligned effective status (count_work_request_effective_statuses).
 * Prefer this for pill counts so they match the RPC.
 */
export function workRequestEffectiveStatusKeyFromColumns(status, executionStatus) {
  const requestStatus = String(status || '').trim() || 'submitted'
  if (requestStatus !== 'approved') return requestStatus
  const exec = String(executionStatus || '').trim()
  if (!exec || exec === 'draft' || exec === 'created') return 'work_order_generated'
  if (exec === 'assigned') return 'technician_assigned'
  return exec
}

export function workRequestEffectiveStatusKey(row) {
  return workRequestEffectiveStatusKeyFromColumns(
    row?.status,
    row?.linked_work_order?.status || row?.execution_status,
  )
}

export function workRequestStatusDisplay(row, { requestLabels = null, workOrderLabels = null } = {}) {
  const requestStatus = String(row?.status || '').trim() || 'submitted'
  const hasWorkOrder = Boolean(row?.manual_work_order_id || row?.linked_work_order?.id)

  if (!hasWorkOrder || requestStatus !== 'approved') {
    const label = requestLabels?.[requestStatus] || REQUEST_FALLBACK[requestStatus] || pretty(requestStatus)
    return { key: requestStatus, label, kind: 'request', title: 'Work request status' }
  }

  const woStatus = String(row?.linked_work_order?.status || row?.execution_status || '').trim()
  if (!woStatus || OPEN_ASSIGNMENT_STATUSES.has(woStatus)) {
    if (hasTechnician(row)) {
      return {
        key: 'technician_assigned',
        label: 'Technician assigned',
        kind: 'work_order',
        title: 'Work order status',
      }
    }
    return {
      key: 'work_order_generated',
      label: 'Work order generated',
      kind: 'work_order',
      title: 'Work order status',
    }
  }

  const woLabel = workOrderLabels?.[woStatus] || WORK_ORDER_FALLBACK[woStatus] || pretty(woStatus)
  return {
    key: woStatus,
    label: `Work order: ${woLabel}`,
    kind: 'work_order',
    title: 'Work order status',
  }
}
