/** Lifecycle phase catalogs for status pill filters. */

export const WO_STATUS_LABELS = {
  draft: 'Draft',
  assigned: 'Assigned',
  accepted: 'Accepted',
  started: 'Started',
  in_progress: 'In progress',
  waiting_material: 'Waiting material',
  waiting_shutdown: 'Waiting shutdown',
  on_hold: 'On hold',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  returned_rework: 'Returned / rework',
  created: 'Created',
}

export const WR_REQUEST_STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  need_info: 'Need info',
  info_provided: 'Info provided',
  cancelled: 'Cancelled',
  converted: 'Converted',
}

export const WR_DISPLAY_STATUS_LABELS = {
  ...WR_REQUEST_STATUS_LABELS,
  work_order_generated: 'Work order generated',
  technician_assigned: 'Technician assigned',
  ...WO_STATUS_LABELS,
}

const PHASE = (id, label, statuses, color) => ({ id, label, statuses, color })

/** Work order lifecycle phases (draft usually excluded by list default). */
export const WORK_ORDER_PHASES = [
  PHASE('open', 'Open', ['assigned', 'accepted'], '#3B82F6'),
  PHASE('in_progress', 'In progress', ['started', 'in_progress'], '#8B5CF6'),
  PHASE('waiting', 'Waiting', ['waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'], '#F59E0B'),
  PHASE('done', 'Done', ['completed', 'verified'], '#10B981'),
  PHASE('closed', 'Closed', ['closed'], '#6B7280'),
]

/**
 * Work request phases use display/effective keys (request status OR execution keys).
 * Matches Status column after approval.
 */
export const WORK_REQUEST_PHASES = [
  PHASE('open', 'Open', [
    'submitted',
    'pending_approval',
    'need_info',
    'info_provided',
    'work_order_generated',
    'technician_assigned',
    'accepted',
  ], '#3B82F6'),
  PHASE('in_progress', 'In progress', ['started', 'in_progress'], '#8B5CF6'),
  PHASE('waiting', 'Waiting', ['waiting_material', 'waiting_shutdown', 'on_hold', 'returned_rework'], '#F59E0B'),
  PHASE('done', 'Done', ['completed', 'verified'], '#10B981'),
  PHASE('closed', 'Closed', ['rejected', 'cancelled', 'closed'], '#6B7280'),
]

/** PM plans — flat (each phase is one status). */
export const PM_PLAN_PHASES = [
  PHASE('inactive', 'Inactive', ['inactive'], '#94A3B8'),
  PHASE('active', 'Active', ['active'], '#10B981'),
  PHASE('overdue', 'Overdue', ['overdue'], '#EF4444'),
]

/** Warranty tabs as phase pills. */
export const WARRANTY_PHASES = [
  PHASE('in_warranty', 'In warranty', ['in_warranty', 'active'], '#10B981'),
  PHASE('expiring_soon', 'Expiring soon', ['expiring_soon'], '#F59E0B'),
  PHASE('expired', 'Expired', ['expired'], '#EF4444'),
  PHASE('out_of_warranty', 'Out of warranty', ['out_of_warranty'], '#6B7280'),
]

export const PHASE_KEY_PREFIX = 'phase:'

export function phaseSelectionKey(phaseId) {
  return `${PHASE_KEY_PREFIX}${phaseId}`
}

export function isPhaseSelectionKey(key) {
  return String(key || '').startsWith(PHASE_KEY_PREFIX)
}

export function phaseIdFromSelectionKey(key) {
  return String(key || '').slice(PHASE_KEY_PREFIX.length)
}

function countMap(counts) {
  const map = new Map()
  for (const row of counts || []) {
    const key = String(row.status ?? row.key ?? '')
    if (!key) continue
    map.set(key, (map.get(key) || 0) + (Number(row.count) || 0))
  }
  return map
}

export function fineCountForStatus(counts, statusKey) {
  return countMap(counts).get(String(statusKey)) || 0
}

/** Sum fine status counts into phase totals. */
export function phaseCountsFromFine(counts, phases) {
  const map = countMap(counts)
  return (phases || []).map((phase) => {
    let total = 0
    for (const status of phase.statuses) {
      total += map.get(status) || 0
    }
    return {
      id: phase.id,
      label: phase.label,
      color: phase.color,
      count: total,
      statuses: phase.statuses,
    }
  })
}

export function totalFromCounts(counts) {
  return (counts || []).reduce((sum, row) => sum + (Number(row.count) || 0), 0)
}

/**
 * Resolve UI selection (phase:* and/or fine status keys) → API statuses[].
 */
export function resolveStatusFilters(selection, phases) {
  const fine = new Set()
  for (const key of selection || []) {
    if (isPhaseSelectionKey(key)) {
      const phase = (phases || []).find((row) => row.id === phaseIdFromSelectionKey(key))
      for (const status of phase?.statuses || []) fine.add(status)
    } else if (key) {
      fine.add(String(key))
    }
  }
  return [...fine]
}

function phaseFullySelected(selection, phase) {
  const set = new Set(selection || [])
  if (set.has(phaseSelectionKey(phase.id))) return true
  return phase.statuses.every((status) => set.has(status))
}

/**
 * Select a phase pill exclusively (radio behavior). Clicking the active phase clears to All.
 * Stores phase:id as the sole selection.
 */
export function togglePhaseSelection(selection, phase) {
  if (!phase?.id) return selection || []
  if (phaseFullySelected(selection || [], phase)) return []
  return [phaseSelectionKey(phase.id)]
}

/**
 * Select a fine status exclusively. Clicking the active fine clears to All.
 */
export function toggleFineSelection(selection, statusKey, _phases) {
  const key = String(statusKey || '')
  if (!key) return selection || []
  const prev = selection || []
  if (prev.length === 1 && prev[0] === key) return []
  return [key]
}

export function selectionIsActiveForPhase(selection, phase) {
  return phaseFullySelected(selection || [], phase)
}

export function selectionIsActiveForFine(selection, statusKey, _phases) {
  const key = String(statusKey || '')
  return (selection || []).length === 1 && selection[0] === key
}

export function labelForFineStatus(statusKey, labelByKey = {}) {
  const key = String(statusKey || '')
  return labelByKey[key] || WR_DISPLAY_STATUS_LABELS[key] || WO_STATUS_LABELS[key] || key.replace(/_/g, ' ')
}

/** Request-side keys that filter wr.status (not execution). */
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

/** Early WO synthetic / execution keys. */
export const WR_EARLY_EXECUTION_KEYS = new Set(['draft', 'created', 'assigned'])

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

/**
 * Build task phases from org status rows ({ id|key, name, is_done, sort_order, color }).
 */
export function buildTaskPhases(statuses = []) {
  const rows = (statuses || []).map((row, index) => ({
    key: String(row.id || row.key || ''),
    label: row.name || row.label || 'Status',
    color: row.color || '#94A3B8',
    isDone: Boolean(row.is_done || row.is_terminal || /done|closed|complete/i.test(String(row.name || row.label || ''))),
    sort: row.sort_order ?? index,
  })).filter((row) => row.key)

  const open = rows.filter((row) => !row.isDone).sort((a, b) => a.sort - b.sort)
  const done = rows.filter((row) => row.isDone).sort((a, b) => a.sort - b.sort)

  const phases = []
  if (open.length) {
    const mid = Math.ceil(open.length / 2)
    const first = open.slice(0, mid)
    const second = open.slice(mid)
    phases.push(PHASE('open', 'Open', first.map((r) => r.key), first[0]?.color || '#3B82F6'))
    if (second.length) {
      phases.push(PHASE('in_progress', 'In progress', second.map((r) => r.key), second[0]?.color || '#8B5CF6'))
    }
  }
  if (done.length) {
    phases.push(PHASE('done', 'Done', done.map((r) => r.key), done[0]?.color || '#10B981'))
  }
  return phases
}

export function taskLabelByKey(statuses = []) {
  const map = {}
  for (const row of statuses || []) {
    const key = String(row.id || row.key || '')
    if (key) map[key] = row.name || row.label || key
  }
  return map
}
