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

function pendingApproverLabel(row) {
  const people = Array.isArray(row?.pending_approvers) ? row.pending_approvers : []
  const names = people.map((person) => String(person?.name || '').trim()).filter(Boolean)
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

/**
 * SQL-aligned effective status (matches count_work_request_effective_statuses).
 */
export function workRequestEffectiveStatusKeyFromColumns(status, executionStatus) {
  const requestStatus = String(status || '').trim() || 'submitted'
  if (requestStatus !== 'approved') return requestStatus
  const exec = String(executionStatus || '').trim()
  if (!exec || exec === 'draft' || exec === 'created') return 'work_order_generated'
  if (exec === 'assigned') return 'technician_assigned'
  return exec
}

/** Prefer display key when row is enriched; else SQL-aligned columns. */
export function workRequestEffectiveStatusKey(row) {
  if (row?.linked_work_order || row?.assigned_technicians || row?.manual_work_order_id) {
    return workRequestStatusDisplay(row).key
  }
  return workRequestEffectiveStatusKeyFromColumns(row?.status, row?.execution_status)
}

/** Aggregate list rows into { status, count }[] for StatusPhaseBar. */
export function tallyWorkRequestStatusCounts(rows = []) {
  const map = new Map()
  for (const row of rows || []) {
    const key = workRequestEffectiveStatusKey(row)
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()].map(([status, count]) => ({ status, count }))
}

/**
 * Status shown on a work request.
 * Before a work order exists, this is the request status.
 * After approval, it follows the work order: generated, technician assigned,
 * then each status the technician (or supervisor) sets on the work order.
 * When approval is waiting, the pending department head is included in the label.
 */
export function workRequestStatusDisplay(row, { requestLabels = null, workOrderLabels = null } = {}) {
  const requestStatus = String(row?.status || '').trim() || 'submitted'
  const hasWorkOrder = Boolean(row?.manual_work_order_id || row?.linked_work_order?.id)

  if (!hasWorkOrder || requestStatus !== 'approved') {
    const base = requestLabels?.[requestStatus] || REQUEST_FALLBACK[requestStatus] || pretty(requestStatus)
    const waiting = requestStatus === 'pending_approval' || requestStatus === 'need_info' || requestStatus === 'info_provided'
    const approver = waiting ? pendingApproverLabel(row) : ''
    const label = approver ? `${base} · ${approver}` : base
    const title = approver
      ? `Awaiting approval from ${approver}`
      : 'Work request status'
    return { key: requestStatus, label, kind: 'request', title, pendingApprover: approver || null }
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
