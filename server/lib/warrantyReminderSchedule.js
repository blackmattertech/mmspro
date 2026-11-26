/**
 * Pure helpers for warranty expiry reminder scheduling.
 * Lead days stay in expiry_notification_days (compat with legacy rows).
 */

export function dateOnly(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function addDays(iso, days) {
  const base = dateOnly(iso)
  if (!base) return null
  const date = new Date(`${base}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return date.toISOString().slice(0, 10)
}

export function addMonths(iso, months) {
  const base = dateOnly(iso)
  if (!base) return null
  const date = new Date(`${base}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0))
  return date.toISOString().slice(0, 10)
}

export function normalizeReminderMode(value) {
  return String(value || '').toLowerCase() === 'recurring' ? 'recurring' : 'one_time'
}

export function normalizeReminderFrequency(mode, value) {
  if (normalizeReminderMode(mode) !== 'recurring') return null
  const freq = String(value || '').toLowerCase()
  if (freq === 'daily' || freq === 'weekly' || freq === 'monthly' || freq === 'custom') return freq
  return 'weekly'
}

export function normalizeReminderInterval(frequency, value) {
  if (normalizeReminderFrequency('recurring', frequency) !== 'custom') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) return 1
  return Math.min(365, Math.round(num))
}

export function normalizeReminderUnit(frequency, value) {
  if (normalizeReminderFrequency('recurring', frequency) !== 'custom') return null
  const unit = String(value || '').toLowerCase()
  if (unit === 'days' || unit === 'weeks' || unit === 'months') return unit
  return 'days'
}

export function normalizeReminderWeekdays(frequency, value) {
  if (normalizeReminderFrequency('recurring', frequency) !== 'weekly') return []
  const list = Array.isArray(value) ? value : []
  const days = [...new Set(list.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
  return days.sort((a, b) => a - b)
}

export function leadDaysForItem(item, warranty = null, orgDefault = 7) {
  const own = Number(item?.expiry_notification_days ?? warranty?.expiry_notification_days)
  if (Number.isFinite(own) && own >= 0) return own
  const fallback = Number(orgDefault)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 7
}

/** First calendar day the reminder may fire (warranty_end − lead days). */
export function firstReminderDate(warrantyEnd, leadDays) {
  const end = dateOnly(warrantyEnd)
  if (!end) return null
  const lead = Number.isFinite(Number(leadDays)) ? Math.max(0, Math.round(Number(leadDays))) : 7
  return addDays(end, -lead)
}

function utcWeekday(iso) {
  const base = dateOnly(iso)
  if (!base) return null
  return new Date(`${base}T00:00:00Z`).getUTCDay()
}

/** Snap to the next included weekday on or after `iso` (UTC weekday 0–6). */
export function snapToWeekdays(iso, weekdays) {
  const start = dateOnly(iso)
  const days = normalizeReminderWeekdays('weekly', weekdays)
  if (!start || !days.length) return start
  let cur = start
  for (let i = 0; i < 7; i++) {
    if (days.includes(utcWeekday(cur))) return cur
    cur = addDays(cur, 1)
  }
  return start
}

function nextWeekdayAfter(iso, weekdays) {
  const start = dateOnly(iso)
  const days = normalizeReminderWeekdays('weekly', weekdays)
  if (!start || !days.length) return addDays(start, 7)
  let cur = addDays(start, 1)
  for (let i = 0; i < 14; i++) {
    if (days.includes(utcWeekday(cur))) return cur
    cur = addDays(cur, 1)
  }
  return null
}

export function reminderAdvanceOptions(item = {}) {
  const frequency = normalizeReminderFrequency('recurring', item.reminder_frequency)
  return {
    frequency,
    interval: normalizeReminderInterval(frequency, item.reminder_interval),
    unit: normalizeReminderUnit(frequency, item.reminder_unit),
    weekdays: normalizeReminderWeekdays(frequency, item.reminder_weekdays),
  }
}

/**
 * Advance one cadence step. Returns null when the next date is after warranty_end.
 */
export function advanceReminderDate(fromDate, frequency, warrantyEnd, options = {}) {
  const start = dateOnly(fromDate)
  const end = dateOnly(warrantyEnd)
  if (!start || !end) return null
  const freq = String(frequency || options.frequency || '').toLowerCase()
  let next = start

  if (freq === 'daily') {
    next = addDays(start, 1)
  } else if (freq === 'weekly') {
    const weekdays = normalizeReminderWeekdays('weekly', options.weekdays)
    next = weekdays.length ? nextWeekdayAfter(start, weekdays) : addDays(start, 7)
  } else if (freq === 'monthly') {
    next = addMonths(start, 1)
  } else if (freq === 'custom') {
    const interval = Math.max(1, Number(options.interval) || 1)
    const unit = String(options.unit || 'days').toLowerCase()
    if (unit === 'weeks') next = addDays(start, interval * 7)
    else if (unit === 'months') next = addMonths(start, interval)
    else next = addDays(start, interval)
  } else {
    return null
  }

  if (!next || next > end) return null
  return next
}

/**
 * Whether a reminder should fire on `today` for this item.
 * one_time: first eligible day through end, once (caller dedupes via alerts).
 * recurring: today is on cadence from first day through end.
 */
export function isReminderDueOn(item, {
  today,
  warranty = null,
  orgDefaultLead = 7,
} = {}) {
  const day = dateOnly(today)
  const end = dateOnly(item?.warranty_end || warranty?.warranty_end)
  if (!day || !end || day > end) return false

  const lead = leadDaysForItem(item, warranty, orgDefaultLead)
  let first = firstReminderDate(end, lead)
  if (!first || day < first) return false

  const mode = normalizeReminderMode(item?.reminder_mode)
  if (mode === 'one_time') {
    if (item?.reminder_last_sent_on) return false
    return true
  }

  const opts = reminderAdvanceOptions(item)
  if (opts.frequency === 'weekly' && opts.weekdays.length) {
    first = snapToWeekdays(first, opts.weekdays)
    if (day < first) return false
  }

  const nextAt = dateOnly(item?.reminder_next_at) || first
  if (day < nextAt) return false
  if (dateOnly(item?.reminder_last_sent_on) === day) return false
  return true
}

/**
 * Cursor after a successful send on `today`.
 * one_time → clear next (null). recurring → advance by frequency (null past end).
 */
export function nextCursorAfterSend(item, today) {
  const day = dateOnly(today)
  const end = dateOnly(item?.warranty_end)
  const mode = normalizeReminderMode(item?.reminder_mode)
  if (mode === 'one_time') {
    return { reminder_last_sent_on: day, reminder_next_at: null }
  }
  const opts = reminderAdvanceOptions(item)
  const advanced = advanceReminderDate(day, opts.frequency, end, opts)
  return { reminder_last_sent_on: day, reminder_next_at: advanced }
}

/** Initial cursor when saving an item. */
export function initialReminderCursor(item, orgDefaultLead = 7) {
  const end = dateOnly(item?.warranty_end)
  if (!end) {
    return { reminder_next_at: null }
  }
  const lead = leadDaysForItem(item, null, orgDefaultLead)
  let first = firstReminderDate(end, lead)
  const mode = normalizeReminderMode(item?.reminder_mode)
  if (mode === 'one_time' && item?.reminder_last_sent_on) {
    return { reminder_next_at: null }
  }
  if (mode === 'recurring') {
    const opts = reminderAdvanceOptions(item)
    if (opts.frequency === 'weekly' && opts.weekdays.length) {
      first = snapToWeekdays(first, opts.weekdays)
    }
  }
  return { reminder_next_at: first }
}

export function alertKeyForSend(warrantyId, itemId, { mode, warrantyEnd, today }) {
  const mid = itemId || 'header'
  if (normalizeReminderMode(mode) === 'recurring') {
    return `${warrantyId}:${mid}:${dateOnly(today)}`
  }
  return `${warrantyId}:${mid}:${dateOnly(warrantyEnd)}`
}
