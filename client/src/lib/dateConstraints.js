/**
 * Local date/datetime helpers for form constraints.
 * Values may be `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, or ISO timestamps with zone.
 */

function pad(n) {
  return String(n).padStart(2, '0')
}

/** Parse a stored date/datetime into a local Date, or null if invalid. */
export function parseLocalDateTime(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const text = String(value).trim()
  if (!text) return null

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const [datePart, timePart] = text.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null

  if (timePart) {
    const [hh, mm] = timePart.slice(0, 5).split(':').map(Number)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null
    return new Date(y, m - 1, d, hh, mm, 0, 0)
  }

  // Date-only: compare as start of that calendar day.
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/**
 * True when value is after "now".
 * Date-only values are future only when the calendar day is after today.
 */
export function isFutureLocalDateTime(value, now = new Date()) {
  const date = parseLocalDateTime(value)
  if (!date) return false

  const text = value instanceof Date ? '' : String(value || '').trim()
  const isDateOnly = text && !text.includes('T') && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)
  if (isDateOnly) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    return day.getTime() > today.getTime()
  }

  return date.getTime() > now.getTime()
}

/** First validation message for fields that must not be in the future. */
export function firstFutureDateMessage(fields, now = new Date()) {
  for (const field of fields || []) {
    if (!field?.value) continue
    if (isFutureLocalDateTime(field.value, now)) {
      return `${field.label || 'Date'} cannot be in the future.`
    }
  }
  return null
}

/** Format local now as `YYYY-MM-DDTHH:mm` for clamping datetime pickers. */
export function formatLocalDateTimeValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
