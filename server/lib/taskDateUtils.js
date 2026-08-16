const REMINDER_PRESETS = {
  at_due: 0,
  '1d': 1440,
  '3d': 4320,
  '7d': 10080,
  '15d': 21600,
  '30d': 43200,
  '60d': 86400,
  '90d': 129600,
  // Legacy presets (minutes before due)
  '5m': 5,
  '10m': 10,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '2h': 120,
  '6h': 360,
  '12h': 720,
  '2d': 2880,
  '1w': 10080,
}

export function combineDateTime(date, time) {
  if (!date) return null
  const timePart = time ? String(time).slice(0, 8) : '00:00:00'
  const iso = `${String(date).slice(0, 10)}T${timePart}`
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function minutesBeforeDue(reminderType, customMinutesBefore) {
  if (reminderType === 'custom') {
    const mins = Number(customMinutesBefore)
    return Number.isFinite(mins) && mins >= 0 ? mins : null
  }
  if (Object.prototype.hasOwnProperty.call(REMINDER_PRESETS, reminderType)) {
    return REMINDER_PRESETS[reminderType]
  }
  return null
}

export function computeRemindAt(dueDate, dueTime, reminderType, customMinutesBefore) {
  const dueAt = combineDateTime(dueDate, dueTime)
  if (!dueAt) return null
  const mins = minutesBeforeDue(reminderType, customMinutesBefore)
  if (mins == null) return null
  return new Date(dueAt.getTime() - mins * 60 * 1000).toISOString()
}

export function computeDueStatus(task, now = new Date()) {
  if (task.completed_at) {
    const dueAt = combineDateTime(task.due_date, task.due_time)
    const completed = new Date(task.completed_at)
    if (!dueAt) return 'completed_on_time'
    return completed.getTime() <= dueAt.getTime() ? 'completed_on_time' : 'completed_late'
  }

  const dueAt = combineDateTime(task.due_date, task.due_time)
  if (!dueAt) return 'upcoming'

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(startOfToday)
  endOfToday.setDate(endOfToday.getDate() + 1)

  if (dueAt < now) return 'overdue'
  if (dueAt >= startOfToday && dueAt < endOfToday) return 'due_today'

  const soonThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  if (dueAt <= soonThreshold) return 'due_soon'

  return 'upcoming'
}

export { REMINDER_PRESETS }
