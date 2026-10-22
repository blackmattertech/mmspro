import { CALENDAR_SCHEDULE_TYPES, normalizeCalendarUnit } from './pmConstants.js'

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
  const scheduleType = plan.schedule_type || 'calendar'
  if (!isCalendarSchedule(scheduleType)) return null

  const every = Math.max(1, Number(plan.every_n) || 1)
  const unit = normalizeCalendarUnit(plan.calendar_unit, scheduleType)
  const base = toDateOnly(fromDate)
  if (!base) return null

  let next
  switch (unit) {
    case 'day':
      next = new Date(base)
      next.setDate(next.getDate() + every)
      break
    case 'week': {
      const weekdays = Array.isArray(plan.weekdays)
        ? plan.weekdays.map(Number).filter((day) => day >= 0 && day <= 6)
        : []
      if (weekdays.length) {
        const wanted = new Set(weekdays)
        next = null
        const span = every * 7
        for (let i = 1; i <= span; i += 1) {
          const candidate = new Date(base)
          candidate.setDate(base.getDate() + i)
          if (!wanted.has(candidate.getDay())) continue
          if (every <= 1 || i > (every - 1) * 7) {
            next = candidate
            break
          }
        }
        if (!next) {
          next = new Date(base)
          next.setDate(next.getDate() + every * 7)
        }
      } else {
        next = new Date(base)
        next.setDate(next.getDate() + every * 7)
      }
      break
    }
    case 'custom': {
      const step = Math.max(1, Number(plan.custom_interval) || every)
      const customUnit = plan.custom_unit || 'day'
      if (customUnit === 'week') {
        next = new Date(base)
        next.setDate(next.getDate() + step * 7)
      } else if (customUnit === 'month') {
        next = addMonths(base, step)
      } else if (customUnit === 'year') {
        next = addMonths(base, step * 12)
      } else {
        next = new Date(base)
        next.setDate(next.getDate() + step)
      }
      break
    }
    case 'month':
      next = addMonths(base, every)
      break
    case 'quarter':
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

  // Legacy schedule_type values without calendar_unit still supported via unit mapping above.
  if (plan.end_date && !plan.never_ends) {
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
  if (plan.end_date && !plan.never_ends) {
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

/** Inactive stays inactive. Live plans become overdue after due date + grace. */
export function resolveLivePlanStatus(plan, now = new Date()) {
  if (String(plan?.status || '') === 'inactive') return 'inactive'
  return isOverdue(plan, now) ? 'overdue' : 'active'
}
