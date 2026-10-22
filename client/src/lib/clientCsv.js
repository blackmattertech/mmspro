import { downloadBlobFile } from './api'

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function downloadClientCsv(filename, rows, columns) {
  const header = columns.map((col) => csvEscape(col.label)).join(',')
  const lines = (rows || []).map((row) => columns.map((col) => {
    const value = typeof col.value === 'function' ? col.value(row) : row?.[col.id]
    return csvEscape(value)
  }).join(','))
  const blob = new Blob([`\uFEFF${[header, ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' })
  downloadBlobFile({ blob, filename })
}
