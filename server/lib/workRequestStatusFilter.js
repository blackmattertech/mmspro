/** Partition and apply WR display/effective status filters (request + execution). */

export const WR_REQUEST_FILTER_KEYS = new Set([
  'draft',
  'submitted',
  'pending_approval',
  'need_info',
  'info_provided',
  'rejected',
  'cancelled',
  'converted',
  'approved',
])

export function partitionWorkRequestStatusFilters(statuses = []) {
  const requestStatuses = []
  const executionStatuses = []
  let includeWorkOrderGenerated = false
  let includeTechnicianAssigned = false

  for (const raw of statuses) {
    const key = String(raw || '').trim()
    if (!key) continue
    if (key === 'work_order_generated') {
      includeWorkOrderGenerated = true
      continue
    }
    if (key === 'technician_assigned') {
      includeTechnicianAssigned = true
      continue
    }
    if (WR_REQUEST_FILTER_KEYS.has(key)) {
      requestStatuses.push(key)
      continue
    }
    executionStatuses.push(key)
  }

  return {
    requestStatuses,
    executionStatuses,
    includeWorkOrderGenerated,
    includeTechnicianAssigned,
  }
}

function hasDisplayStatusFilters(part) {
  return Boolean(
    part.requestStatuses.length
    || part.executionStatuses.length
    || part.includeWorkOrderGenerated
    || part.includeTechnicianAssigned,
  )
}

/**
 * Apply status pills that may mix request statuses and WO execution/display keys.
 * Falls back to null when statuses is empty (caller applies defaultExclude).
 */
export function applyWorkRequestDisplayStatusFilter(query, statuses = []) {
  const list = (statuses || []).map((item) => String(item || '').trim()).filter(Boolean)
  if (!list.length) return { query, applied: false }

  const part = partitionWorkRequestStatusFilters(list)
  if (!hasDisplayStatusFilters(part)) return { query, applied: false }

  const clauses = []
  for (const status of part.requestStatuses) {
    clauses.push(`status.eq.${status}`)
  }
  for (const status of part.executionStatuses) {
    clauses.push(`and(status.eq.approved,execution_status.eq.${status})`)
  }
  if (part.includeWorkOrderGenerated) {
    clauses.push('and(status.eq.approved,or(execution_status.is.null,execution_status.in.(draft,created)))')
  }
  if (part.includeTechnicianAssigned) {
    clauses.push('and(status.eq.approved,execution_status.eq.assigned)')
  }

  if (!clauses.length) return { query, applied: false }
  return { query: query.or(clauses.join(',')), applied: true }
}
