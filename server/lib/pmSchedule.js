import { CALENDAR_SCHEDULE_TYPES } from './pmConstants.js'

function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d
}

function toDateOnly(value) {
  if (!value) return null
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const text = String(value).slice(0, 10)
  const [y, m, d] = text.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function formatDateOnly(value) {
  const d = toDateOnly(value)
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isCalendarSchedule(scheduleType) {
  return CALENDAR_SCHEDULE_TYPES.has(scheduleType)
}

export function computeNextDueDate(plan, fromDate) {
  const scheduleType = plan.schedule_type || 'monthly'
  if (!isCalendarSchedule(scheduleType)) return null

  const every = Math.max(1, Number(plan.every_n) || 1)
  const base = toDateOnly(fromDate)
  if (!base) return null

  let next
  switch (scheduleType) {
    case 'daily':
      next = new Date(base)
      next.setDate(next.getDate() + every)
      break
    case 'weekly':
      next = new Date(base)
      next.setDate(next.getDate() + every * 7)
      break
    case 'monthly':
    case 'calendar':
      next = addMonths(base, every)
      break
    case 'quarterly':
      next = addMonths(base, every * 3)
      break
    case 'half_yearly':
      next = addMonths(base, every * 6)
      break
    case 'yearly':
      next = addMonths(base, every * 12)
      break
    default:
      return null
  }

  if (plan.end_date) {
    const end = toDateOnly(plan.end_date)
    if (end && next > end) return null
  }

  return formatDateOnly(next)
}

export function initialDueDate(plan) {
  return formatDateOnly(plan.start_date) || formatDateOnly(new Date())
}

export function generateOnOrBefore(plan, now = new Date()) {
  const due = toDateOnly(plan.next_due_at)
  if (!due) return false
  if (plan.end_date) {
    const end = toDateOnly(plan.end_date)
    if (end && due > end) return false
  }
  const lead = Math.max(0, Number(plan.generate_before_days) || 0)
  const generateAt = new Date(due)
  generateAt.setDate(generateAt.getDate() - lead)
  const today = toDateOnly(now)
  return today >= generateAt
}

export function isOverdue(plan, now = new Date()) {
  const due = toDateOnly(plan.next_due_at)
  if (!due) return false
  const grace = Math.max(0, Number(plan.grace_days) || 0)
  const limit = new Date(due)
  limit.setDate(limit.getDate() + grace)
  return toDateOnly(now) > limit
}
