/** Lifecycle progress for a work order, derived from status (not user-entered). */
export const WORK_ORDER_PROGRESS_BY_STATUS = {
  draft: 0,
  assigned: 10,
  accepted: 20,
  started: 35,
  in_progress: 55,
  waiting_material: 45,
  waiting_shutdown: 45,
  on_hold: 40,
  returned_rework: 25,
  completed: 80,
  verified: 90,
  closed: 100,
}

export function progressPercentForStatus(status, statuses = []) {
  const key = String(status || '').trim()
  if (!key) return 0
  if (Object.prototype.hasOwnProperty.call(WORK_ORDER_PROGRESS_BY_STATUS, key)) {
    return WORK_ORDER_PROGRESS_BY_STATUS[key]
  }
  const def = (statuses || []).find((row) => (row.key || row.value) === key)
  if (!def) return 0
  if (def.is_terminal) return 100
  const ordered = [...statuses].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const idx = ordered.findIndex((row) => (row.key || row.value) === key)
  if (idx < 0) return 0
  return Math.round((idx / Math.max(ordered.length - 1, 1)) * 90)
}
