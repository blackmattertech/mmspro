/** Fixed pill catalogs + default status→phase maps for Status Filter masters. */

const PHASE = (id, label, color) => ({ id, label, color })

export const STATUS_FILTER_ENTITY_TYPES = [
  {
    key: 'work_request',
    label: 'Work Request',
    description: 'Map work request display statuses to Open / In progress / Waiting / Done / Closed pills.',
  },
  {
    key: 'work_order',
    label: 'Work Order',
    description: 'Map work order statuses to Open / In progress / Waiting / Done / Closed pills.',
  },
  {
    key: 'task',
    label: 'Tasks & Follow-ups',
    description: 'Map task statuses to Open / In progress / Waiting / Done / Closed pills.',
  },
  {
    key: 'pm_plan',
    label: 'Planned Maintenance',
    description: 'Map PM plan statuses to Inactive / Active / Overdue pills.',
  },
  {
    key: 'warranty',
    label: 'Warranty',
    description: 'Map warranty status buckets to warranty list tabs.',
  },
]

export const MODULE_PHASE_CATALOGS = {
  work_request: [
    PHASE('open', 'Open', '#3B82F6'),
    PHASE('in_progress', 'In progress', '#8B5CF6'),
    PHASE('waiting', 'Waiting', '#F59E0B'),
    PHASE('done', 'Done', '#10B981'),
    PHASE('closed', 'Closed', '#6B7280'),
  ],
  work_order: [
    PHASE('open', 'Open', '#3B82F6'),
    PHASE('in_progress', 'In progress', '#8B5CF6'),
    PHASE('waiting', 'Waiting', '#F59E0B'),
    PHASE('done', 'Done', '#10B981'),
    PHASE('closed', 'Closed', '#6B7280'),
  ],
  task: [
    PHASE('open', 'Open', '#3B82F6'),
    PHASE('in_progress', 'In progress', '#8B5CF6'),
    PHASE('waiting', 'Waiting', '#F59E0B'),
    PHASE('done', 'Done', '#10B981'),
    PHASE('closed', 'Closed', '#6B7280'),
  ],
  pm_plan: [
    PHASE('inactive', 'Inactive', '#94A3B8'),
    PHASE('active', 'Active', '#10B981'),
    PHASE('overdue', 'Overdue', '#EF4444'),
  ],
  warranty: [
    PHASE('in_warranty', 'In warranty', '#10B981'),
    PHASE('expiring_soon', 'Expiring soon', '#F59E0B'),
    PHASE('expired', 'Expired', '#EF4444'),
    PHASE('out_of_warranty', 'Out of warranty', '#6B7280'),
  ],
}

/** Default status_key → phase_id for non-task modules (fixed keys). */
export const DEFAULT_STATUS_PHASE_MAPS = {
  work_request: {
    submitted: 'open',
    pending_approval: 'open',
    need_info: 'open',
    info_provided: 'open',
    work_order_generated: 'open',
    technician_assigned: 'open',
    accepted: 'open',
    started: 'in_progress',
    in_progress: 'in_progress',
    waiting_material: 'waiting',
    waiting_shutdown: 'waiting',
    on_hold: 'waiting',
    returned_rework: 'waiting',
    completed: 'done',
    verified: 'done',
    rejected: 'closed',
    cancelled: 'closed',
    closed: 'closed',
  },
  work_order: {
    assigned: 'open',
    accepted: 'open',
    started: 'in_progress',
    in_progress: 'in_progress',
    waiting_material: 'waiting',
    waiting_shutdown: 'waiting',
    on_hold: 'waiting',
    returned_rework: 'waiting',
    completed: 'done',
    verified: 'done',
    closed: 'closed',
  },
  pm_plan: {
    inactive: 'inactive',
    active: 'active',
    overdue: 'overdue',
  },
  warranty: {
    in_warranty: 'in_warranty',
    active: 'in_warranty',
    expiring_soon: 'expiring_soon',
    expired: 'expired',
    out_of_warranty: 'out_of_warranty',
  },
}

/** Extra WR display keys that are not always present as org_statuses rows. */
export const WR_DISPLAY_STATUS_KEYS = [
  { key: 'draft', name: 'Draft', color: '#94A3B8' },
  { key: 'submitted', name: 'Submitted', color: '#3B82F6' },
  { key: 'pending_approval', name: 'Pending approval', color: '#F59E0B' },
  { key: 'approved', name: 'Approved', color: '#10B981' },
  { key: 'rejected', name: 'Rejected', color: '#EF4444' },
  { key: 'need_info', name: 'Need info', color: '#8B5CF6' },
  { key: 'info_provided', name: 'Info provided', color: '#8B5CF6' },
  { key: 'cancelled', name: 'Cancelled', color: '#6B7280' },
  { key: 'converted', name: 'Converted', color: '#6B7280' },
  { key: 'work_order_generated', name: 'Work order generated', color: '#3B82F6' },
  { key: 'technician_assigned', name: 'Technician assigned', color: '#10B981' },
  { key: 'created', name: 'Created', color: '#94A3B8' },
  { key: 'assigned', name: 'Assigned', color: '#3B82F6' },
  { key: 'accepted', name: 'Accepted', color: '#06B6D4' },
  { key: 'started', name: 'Started', color: '#6366F1' },
  { key: 'in_progress', name: 'In progress', color: '#8B5CF6' },
  { key: 'waiting_material', name: 'Waiting material', color: '#F59E0B' },
  { key: 'waiting_shutdown', name: 'Waiting shutdown', color: '#F97316' },
  { key: 'on_hold', name: 'On hold', color: '#EAB308' },
  { key: 'completed', name: 'Completed', color: '#10B981' },
  { key: 'verified', name: 'Verified', color: '#14B8A6' },
  { key: 'closed', name: 'Closed', color: '#6B7280' },
  { key: 'returned_rework', name: 'Returned / rework', color: '#EF4444' },
]

export const WARRANTY_STATUS_KEYS = [
  { key: 'in_warranty', name: 'In warranty', color: '#10B981' },
  { key: 'active', name: 'Active', color: '#10B981' },
  { key: 'expiring_soon', name: 'Expiring soon', color: '#F59E0B' },
  { key: 'expired', name: 'Expired', color: '#EF4444' },
  { key: 'out_of_warranty', name: 'Out of warranty', color: '#6B7280' },
]

export function assertStatusFilterEntityType(entityType) {
  const key = String(entityType || '').trim()
  if (!MODULE_PHASE_CATALOGS[key]) {
    const err = new Error('Invalid status filter module.')
    err.status = 400
    throw err
  }
  return key
}

export function phaseIdsForEntity(entityType) {
  return new Set((MODULE_PHASE_CATALOGS[entityType] || []).map((row) => row.id))
}

/**
 * Build StatusPhaseBar phases from org mappings.
 * @param {string} entityType
 * @param {Array<{ status_key: string, phase_id: string }>|Record<string, string>} mappings
 */
export function buildPhasesFromMaps(entityType, mappings = []) {
  const catalog = MODULE_PHASE_CATALOGS[entityType] || []
  const byPhase = new Map(catalog.map((phase) => [phase.id, []]))

  const rows = Array.isArray(mappings)
    ? mappings
    : Object.entries(mappings || {}).map(([status_key, phase_id]) => ({ status_key, phase_id }))

  for (const row of rows) {
    const statusKey = String(row?.status_key || '').trim()
    const phaseId = String(row?.phase_id || '').trim()
    if (!statusKey || !phaseId || !byPhase.has(phaseId)) continue
    byPhase.get(phaseId).push(statusKey)
  }

  return catalog.map((phase) => ({
    id: phase.id,
    label: phase.label,
    color: phase.color,
    statuses: byPhase.get(phase.id) || [],
  }))
}

/** Flatten default map object → rows for DB insert. */
export function defaultMapRowsForEntity(entityType) {
  const map = DEFAULT_STATUS_PHASE_MAPS[entityType] || {}
  return Object.entries(map).map(([status_key, phase_id]) => ({ status_key, phase_id }))
}

/**
 * Seed task maps from task status rows: non-done → open (split mid → in_progress), done → done.
 */
export function defaultTaskMapsFromStatuses(statuses = []) {
  const rows = (statuses || []).map((row, index) => ({
    key: String(row.id || row.key || ''),
    isDone: Boolean(row.is_done || row.is_terminal || /done|closed|complete/i.test(String(row.name || row.label || ''))),
    sort: row.sort_order ?? index,
  })).filter((row) => row.key)

  const open = rows.filter((row) => !row.isDone).sort((a, b) => a.sort - b.sort)
  const done = rows.filter((row) => row.isDone).sort((a, b) => a.sort - b.sort)
  const maps = {}
  if (open.length) {
    const mid = Math.ceil(open.length / 2)
    open.slice(0, mid).forEach((row) => { maps[row.key] = 'open' })
    open.slice(mid).forEach((row) => { maps[row.key] = 'in_progress' })
  }
  done.forEach((row) => { maps[row.key] = 'done' })
  return maps
}

export function mappingsToObject(rows = []) {
  const out = {}
  for (const row of rows || []) {
    const key = String(row.status_key || '').trim()
    const phaseId = String(row.phase_id || '').trim()
    if (key && phaseId) out[key] = phaseId
  }
  return out
}
