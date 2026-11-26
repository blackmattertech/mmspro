export function formatHoursCell(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2,
  })} h`
}

export function formatRateCell(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return `${Number(value).toFixed(6)} /h`
}

export function formatPctCell(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return `${Number(value).toFixed(2)}%`
}

export function formatNumberCell(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A'
  return Number(value).toLocaleString('en-US')
}

export function defaultReliabilityDateRange() {
  const now = new Date()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return { from: iso(from), to: iso(to) }
}
