export const VOICE_PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
]

function startOfDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatYMD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getVoicePeriodRange(periodId) {
  const today = startOfDay()

  switch (periodId) {
    case 'tomorrow': {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return { due_from: formatYMD(tomorrow), due_to: formatYMD(tomorrow) }
    }
    case 'this_week': {
      const start = new Date(today)
      const weekday = start.getDay()
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday
      start.setDate(start.getDate() + mondayOffset)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { due_from: formatYMD(start), due_to: formatYMD(end) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { due_from: formatYMD(start), due_to: formatYMD(end) }
    }
    case 'today':
    default: {
      return { due_from: formatYMD(today), due_to: formatYMD(today) }
    }
  }
}

export function getVoicePeriodSpeechLabel(periodId) {
  switch (periodId) {
    case 'tomorrow':
      return 'tomorrow'
    case 'this_week':
      return 'this week'
    case 'this_month':
      return 'this month'
    case 'today':
    default:
      return 'today'
  }
}
