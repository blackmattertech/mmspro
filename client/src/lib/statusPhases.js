/** Lifecycle phase catalogs for status pill filters. */

import {
  MODULE_PHASE_CATALOGS,
  DEFAULT_STATUS_PHASE_MAPS,
  buildPhasesFromMaps,
  defaultTaskMapsFromStatuses,
  mappingsToObject,
} from '../../../shared/statusPhaseMaps.js'

export {
  MODULE_PHASE_CATALOGS,
  DEFAULT_STATUS_PHASE_MAPS,
  buildPhasesFromMaps,
  defaultTaskMapsFromStatuses,
  mappingsToObject,
}

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

/** @deprecated Prefer buildPhasesFromMaps with org maps; kept as default fallback. */
export const WORK_ORDER_PHASES = buildPhasesFromMaps('work_order', DEFAULT_STATUS_PHASE_MAPS.work_order)

/** @deprecated Prefer buildPhasesFromMaps with org maps; kept as default fallback. */
export const WORK_REQUEST_PHASES = buildPhasesFromMaps('work_request', DEFAULT_STATUS_PHASE_MAPS.work_request)

/** @deprecated Prefer buildPhasesFromMaps with org maps; kept as default fallback. */
export const PM_PLAN_PHASES = buildPhasesFromMaps('pm_plan', DEFAULT_STATUS_PHASE_MAPS.pm_plan)

/** @deprecated Prefer buildPhasesFromMaps with org maps; kept as default fallback. */
export const WARRANTY_PHASES = buildPhasesFromMaps('warranty', DEFAULT_STATUS_PHASE_MAPS.warranty)

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
  if (!phase.statuses?.length) return false
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
 * Build task phases from org status rows — falls back to heuristic when maps missing.
 * Prefer buildPhasesFromMaps('task', maps) with org Status Filter maps.
 */
export function buildTaskPhases(statuses = [], mappings = null) {
  if (mappings) {
    return buildPhasesFromMaps('task', mappings)
  }
  return buildPhasesFromMaps('task', defaultTaskMapsFromStatuses(statuses))
}

export function taskLabelByKey(statuses = []) {
  const map = {}
  for (const row of statuses || []) {
    const key = String(row.id || row.key || '')
    if (key) map[key] = row.name || row.label || key
  }
  return map
}

/** Resolve phases for a module from bootstrap/API maps, with catalog defaults. */
export function phasesForEntity(entityType, mapsByEntity = {}) {
  const maps = mapsByEntity?.[entityType]
  if (Array.isArray(maps) && maps.length) {
    return buildPhasesFromMaps(entityType, maps)
  }
  if (maps && typeof maps === 'object' && !Array.isArray(maps) && Object.keys(maps).length) {
    return buildPhasesFromMaps(entityType, maps)
  }
  const defaults = DEFAULT_STATUS_PHASE_MAPS[entityType]
  if (defaults) return buildPhasesFromMaps(entityType, defaults)
  return MODULE_PHASE_CATALOGS[entityType]?.map((phase) => ({
    ...phase,
    statuses: [],
  })) || []
}
