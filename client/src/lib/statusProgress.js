/** Fallback progress when a technician has not saved a manual percent. */
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

function verifiedStatus(statuses) {
  return (statuses || []).find((row) => (row.key || row.value) === 'verified') || null
}

export function progressPercentForStatus(status, statuses = []) {
  const key = String(status || '').trim()
  if (!key) return 0
  if (Object.prototype.hasOwnProperty.call(WORK_ORDER_PROGRESS_BY_STATUS, key)) {
    const verified = verifiedStatus(statuses)
    if (key === 'completed' && verified && verified.is_active === false) return 100
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

/** Saved technician progress when present, otherwise the status fallback. */
export function resolveProgressPercent(record, statuses = []) {
  if (record?.progress_percent != null && record.progress_percent !== '') {
    const stored = Number(record.progress_percent)
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, Math.round(stored)))
  }
  return progressPercentForStatus(record?.status, statuses)
}
