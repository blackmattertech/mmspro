import { combineDateTime } from './taskDateUtils.js'

function addMonths(date, months) {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d
}

function addQuarters(date, quarters) {
  return addMonths(date, quarters * 3)
}

export function computeNextOccurrence(recurrence, fromDate = new Date()) {
  if (!recurrence) return null

  const base = recurrence.next_occurrence_at
    ? new Date(recurrence.next_occurrence_at)
    : combineDateTime(recurrence.recurrence_start_date, '00:00:00') || fromDate

  let next = new Date(base)

  switch (recurrence.frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly': {
      const weekdays = Array.isArray(recurrence.weekdays) && recurrence.weekdays.length
        ? recurrence.weekdays.map(Number)
        : null
      if (weekdays?.length) {
        let candidate = new Date(next)
        for (let i = 0; i < 14; i++) {
          candidate.setDate(candidate.getDate() + 1)
          if (weekdays.includes(candidate.getDay())) {
            next = candidate
            break
          }
        }
      } else {
        next.setDate(next.getDate() + 7)
      }
      break
    }
    case 'monthly':
      next = addMonths(next, 1)
      break
    case 'quarterly':
      next = addQuarters(next, 1)
      break
    case 'half_yearly':
      next = addMonths(next, 6)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
    case 'custom': {
      const interval = Math.max(1, Number(recurrence.custom_interval) || 1)
      const unit = recurrence.custom_unit || 'days'
      if (unit === 'weeks') next.setDate(next.getDate() + interval * 7)
      else if (unit === 'months') next = addMonths(next, interval)
      else next.setDate(next.getDate() + interval)
      break
    }
    default:
      return null
  }

  if (!recurrence.never_ends && recurrence.recurrence_end_date) {
    const end = combineDateTime(recurrence.recurrence_end_date, '23:59:59')
    if (end && next > end) return null
  }

  return next.toISOString()
}

export function normalizeRecurrencePayload(body) {
  return {
    frequency: body.frequency || 'daily',
    custom_interval: body.custom_interval != null ? Number(body.custom_interval) : null,
    custom_unit: body.custom_unit || null,
    weekdays: Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [],
    recurrence_start_date: body.recurrence_start_date || body.start_date || null,
    recurrence_end_date: body.recurrence_end_date || null,
    never_ends: Boolean(body.never_ends),
  }
}
