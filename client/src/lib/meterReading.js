function parseStamp(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatMeterValue(value) {
  if (value == null || value === '') return '—'
  const reading = Number(value)
  if (!Number.isFinite(reading)) return '—'
  return reading.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function formatMeterStamp(value) {
  const date = parseStamp(value)
  if (!date) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatMeterDate(value) {
  const date = parseStamp(value)
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMeterLogger(row) {
  return [
    row?.logged_by_name,
    row?.logged_by_department,
    row?.logged_by_designation,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
}

export function formatMeterTime(value) {
  const date = parseStamp(value)
  if (!date) return '—'
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
