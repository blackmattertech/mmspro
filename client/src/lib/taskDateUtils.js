import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from './displayDate'

function combineDateTime(date, time) {
  if (!date) return null
  const timePart = time ? String(time).slice(0, 8) : '00:00:00'
  const dt = new Date(`${String(date).slice(0, 10)}T${timePart}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function formatTime(date) {
  return formatDisplayTime(date)
}

export function formatTaskDateTimeDetail(date, time) {
  const dt = combineDateTime(date, time)
  if (!dt) return '—'
  return formatDisplayDateTime(dt)
}

export function formatTaskDateTime(date, time) {
  const dt = combineDateTime(date, time)
  if (!dt) return '—'

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const startOfDayAfter = new Date(startOfTomorrow)
  startOfDayAfter.setDate(startOfDayAfter.getDate() + 1)

  const timeLabel = formatTime(dt)

  if (dt >= startOfToday && dt < startOfTomorrow) {
    return `Today • ${timeLabel}`
  }
  if (dt >= startOfTomorrow && dt < startOfDayAfter) {
    return `Tomorrow • ${timeLabel}`
  }

  return `${formatDisplayDate(dt)} • ${timeLabel}`
}

export function formatTaskDueShort(date, time) {
  const dt = combineDateTime(date, time)
  if (!dt) return null
  return formatDisplayDate(dt)
}

export function dueStatusClass(status) {
  switch (status) {
    case 'overdue':
      return 'task-badge--overdue'
    case 'due_today':
      return 'task-badge--due-today'
    case 'due_soon':
      return 'task-badge--due-soon'
    case 'completed_on_time':
      return 'task-badge--completed'
    case 'completed_late':
      return 'task-badge--completed-late'
    default:
      return 'task-badge--upcoming'
  }
}

export { combineDateTime }
