/** Hours between two date/datetime strings. Null if missing or end before start. */
export function hoursBetween(startAt, endAt) {
  if (!startAt || !endAt) return null
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round(((end - start) / 3600000) * 100) / 100
}

/** Human-readable duration from hours (e.g. "24 hours", "1h 30m"). */
export function formatDurationHours(hours) {
  if (hours == null || !Number.isFinite(Number(hours))) return ''
  const value = Number(hours)
  if (value === 0) return '0 hours'
  if (value < 1) {
    const minutes = Math.max(1, Math.round(value * 60))
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  const whole = Math.floor(value)
  const minutes = Math.round((value - whole) * 60)
  if (minutes === 0) {
    return `${value} hour${value === 1 ? '' : 's'}`
  }
  return `${whole}h ${minutes}m`
}
