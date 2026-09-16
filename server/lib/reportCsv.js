import { columnsForReport, formatReportValue } from './reportConstants.js'

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function orderedReportColumns(kind, selected = []) {
  const allowed = columnsForReport(kind)
  const byId = new Map(allowed.map((col) => [col.id, col]))
  const list = (Array.isArray(selected) ? selected : [])
    .map((id) => byId.get(id))
    .filter(Boolean)
  return list.length ? list : allowed
}

export function buildReportCsv({ kind, columns = [], rows = [] }) {
  const defs = orderedReportColumns(kind, columns)
  const header = defs.map((col) => csvCell(col.label)).join(',')
  const lines = (rows || []).map((row) => (
    defs.map((col) => csvCell(formatReportValue(col.id, row?.[col.id]))).join(',')
  ))
  return `\uFEFF${[header, ...lines].join('\n')}`
}

export function reportCsvFilename(title, dateFrom, dateTo) {
  const slug = String(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug}-${dateFrom || 'from'}-to-${dateTo || 'to'}.csv`
}
