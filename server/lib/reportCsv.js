import { columnsForReport, formatReportValue, isDynamicReportColumnId } from './reportConstants.js'
import { formatDisplayDate } from './displayDate.js'

function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function orderedReportColumns(kind, selected = [], extraDefs = []) {
  const allowed = columnsForReport(kind)
  const byId = new Map(allowed.map((col) => [col.id, col]))
  for (const col of extraDefs || []) {
    if (col?.id) byId.set(col.id, col)
  }
  const list = (Array.isArray(selected) ? selected : [])
    .map((item) => {
      if (item && typeof item === 'object' && item.id) {
        return byId.get(item.id) || item
      }
      return byId.get(item)
    })
    .filter((col) => col?.id && (byId.has(col.id) || isDynamicReportColumnId(col.id)))
  return list.length ? list : allowed
}

export function buildReportCsv({ kind, columns = [], rows = [], extraDefs = [] }) {
  const defs = Array.isArray(columns) && columns[0] && typeof columns[0] === 'object' && columns[0].id && columns[0].label
    ? columns
    : orderedReportColumns(kind, columns, extraDefs)
  const header = defs.map((col) => csvCell(col.label)).join(',')
  const lines = (rows || []).map((row) => (
    defs.map((col) => csvCell(formatReportValue(col.id, row?.[col.id]))).join(',')
  ))
  return `\uFEFF${[header, ...lines].join('\n')}`
}

export function reportCsvFilename(title, dateFrom, dateTo) {
  const slug = String(title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const from = formatDisplayDate(dateFrom) || 'from'
  const to = formatDisplayDate(dateTo) || 'to'
  return `${slug}-${from}-to-${to}.csv`
}
