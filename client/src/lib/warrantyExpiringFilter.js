export const DEFAULT_WARRANTY_EXPIRING_FILTER = {
  mode: 'days',
  minDays: '0',
  maxDays: '30',
  dateFrom: '',
  dateTo: '',
}

export const WARRANTY_EXPIRING_DAY_PRESETS = [
  { id: '7', label: '7 days', minDays: '0', maxDays: '7' },
  { id: '30', label: '30 days', minDays: '0', maxDays: '30' },
  { id: '60', label: '60 days', minDays: '0', maxDays: '60' },
  { id: '90', label: '90 days', minDays: '0', maxDays: '90' },
]

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseDateOnly(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function matchesWarrantyExpiringSoon(row, filter = DEFAULT_WARRANTY_EXPIRING_FILTER) {
  const end = parseDateOnly(row?.warranty_end)
  if (!end) return false

  if (filter.mode === 'dates') {
    const from = parseDateOnly(filter.dateFrom)
    const to = parseDateOnly(filter.dateTo)
    if (!from || !to) return true
    if (from > to) return false
    return end >= from && end <= to
  }

  const minDays = Math.max(0, Number(filter.minDays) || 0)
  const maxDays = Math.max(minDays, Number(filter.maxDays) || 0)
  const today = startOfDay()
  const from = new Date(today)
  from.setDate(from.getDate() + minDays)
  const to = new Date(today)
  to.setDate(to.getDate() + maxDays)

  return end >= from && end <= to
}

export function isWarrantyExpiringFilterValid(filter = DEFAULT_WARRANTY_EXPIRING_FILTER) {
  if (filter.mode === 'dates') {
    const from = parseDateOnly(filter.dateFrom)
    const to = parseDateOnly(filter.dateTo)
    return Boolean(from && to && from <= to)
  }

  const maxDays = Number(filter.maxDays)
  return Number.isFinite(maxDays) && maxDays >= 0
}

export function warrantyExpiringFilterSummary(filter = DEFAULT_WARRANTY_EXPIRING_FILTER) {
  if (filter.mode === 'dates') {
    if (!filter.dateFrom && !filter.dateTo) return 'Select a date range'
    if (!filter.dateFrom || !filter.dateTo) return 'Select start and end dates'
    return `${filter.dateFrom} to ${filter.dateTo}`
  }

  const minDays = Math.max(0, Number(filter.minDays) || 0)
  const maxDays = Math.max(minDays, Number(filter.maxDays) || 0)
  if (minDays === maxDays) {
    return minDays === 0 ? 'Today' : `In ${minDays} days`
  }
  return `${minDays}–${maxDays} days from today`
}
