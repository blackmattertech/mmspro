const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_INDEX = new Map(MONTHS.map((name, index) => [name.toLowerCase(), index]))

function pad(value) {
  return String(value).padStart(2, '0')
}

function isRealDate(year, monthIndex, day) {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, monthIndex, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === monthIndex
    && date.getUTCDate() === day
}

function fromParts(year, monthIndex, day) {
  if (!isRealDate(year, monthIndex, day)) return ''
  return `${pad(day)}-${MONTHS[monthIndex]}-${year}`
}

function clockParts(date, utc) {
  return {
    year: utc ? date.getUTCFullYear() : date.getFullYear(),
    month: utc ? date.getUTCMonth() : date.getMonth(),
    day: utc ? date.getUTCDate() : date.getDate(),
    hour: utc ? date.getUTCHours() : date.getHours(),
    minute: utc ? date.getUTCMinutes() : date.getMinutes(),
  }
}

function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Calendar date as `DD-MMM-YYYY`, for example `13-Nov-2026`.
 * A `YYYY-MM-DD` string keeps that calendar day. Timestamps use local time
 * unless `utc` is set.
 */
export function formatDisplayDate(value, { utc = false } = {}) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const text = value.trim()
    const shown = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\b|[^0-9])/)
    if (shown) {
      const month = MONTH_INDEX.get(shown[2].toLowerCase())
      if (month == null) return ''
      return fromParts(Number(shown[3]), month, Number(shown[1]))
    }
    const isoDay = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoDay) {
      return fromParts(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
    }
  }
  const date = asDate(value)
  if (!date) return ''
  const parts = clockParts(date, utc)
  return fromParts(parts.year, parts.month, parts.day)
}

/**
 * Date-only fields. A leading `YYYY-MM-DD` is that calendar day, even when a
 * time suffix is present, so the label does not shift across time zones.
 */
export function formatCalendarDate(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const iso = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/)
    if (iso) return formatDisplayDate(iso[1])
  }
  return formatDisplayDate(value)
}

/** `DD-MMM-YYYY HH:mm`. A date-only value stays date-only. */
export function formatDisplayDateTime(value, { utc = false } = {}) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    const text = value.trim()
    if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(text)) return formatDisplayDate(text)
    if (/^\d{1,2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}$/.test(text)) {
      const [datePart, timePart] = text.split(' ')
      const dateLabel = formatDisplayDate(datePart)
      return dateLabel ? `${dateLabel} ${timePart}` : ''
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDisplayDate(text)
  }
  const date = asDate(value)
  if (!date) return ''
  const parts = clockParts(date, utc)
  const dateLabel = fromParts(parts.year, parts.month, parts.day)
  if (!dateLabel) return ''
  return `${dateLabel} ${pad(parts.hour)}:${pad(parts.minute)}`
}

export function formatDisplayTime(value, { utc = false } = {}) {
  const date = asDate(value)
  if (!date) return ''
  const parts = clockParts(date, utc)
  return `${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Format an ISO date or timestamp. Leave every other value unchanged. */
export function formatDisplayDateValue(value, options = {}) {
  if (value == null || value === '') return value ?? ''
  if (value instanceof Date) return formatDisplayDateTime(value, options)
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDisplayDate(text)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return formatDisplayDateTime(text, options)
  return value
}

/** Parse a display or ISO date into `YYYY-MM-DD` for storage. */
export function parseToIsoDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  const dmon = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  let year
  let monthIndex
  let day
  if (iso) {
    year = Number(iso[1])
    monthIndex = Number(iso[2]) - 1
    day = Number(iso[3])
  } else if (dmon) {
    year = Number(dmon[3])
    monthIndex = MONTH_INDEX.get(dmon[2].toLowerCase())
    day = Number(dmon[1])
    if (monthIndex == null) return null
  } else if (dmy) {
    year = Number(dmy[3])
    monthIndex = Number(dmy[2]) - 1
    day = Number(dmy[1])
  } else {
    return null
  }
  if (!isRealDate(year, monthIndex, day)) return null
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`
}
