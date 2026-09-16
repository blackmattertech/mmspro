import ExcelJS from 'exceljs'

export const TEMPLATE_SHEET = 'Template'
export const VALID_VALUES_SHEET = 'Valid values'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function cellToString(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'object') {
    if (value.text) return String(value.text)
    if (value.result != null) return cellToString(value.result)
    if (value.richText) return value.richText.map((part) => part.text).join('')
    return ''
  }
  return String(value).trim()
}

export function cellToDate(value) {
  const text = cellToString(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  return null
}

export function parseList(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function matchChoice(value, options) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const needle = normalizeName(raw)
  const match = options.find((option) => (
    normalizeName(option.value) === needle || normalizeName(option.label) === needle
  ))
  return match?.value || null
}

export function findByNameOrCode(rows, value, fields = ['name', 'code']) {
  const token = normalizeName(String(value || '').split(/\s*[—–−-]\s*/)[0])
  if (!token || !rows?.length) return null
  return rows.find((row) => fields.some((field) => normalizeName(row?.[field]) === token))
    || rows.find((row) => fields.some((field) => {
      const haystack = normalizeName(row?.[field])
      return haystack && (haystack.includes(token) || token.includes(haystack))
    }))
    || null
}

export async function buildWorkbook(templateColumns, validColumns = [], { sampleRow = null } = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  templateSheet.addRow(templateColumns)
  templateSheet.getRow(1).font = { bold: true }
  if (sampleRow) templateSheet.addRow(templateColumns.map((header) => sampleRow[header] ?? ''))
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  templateSheet.columns = templateColumns.map((header) => ({
    width: Math.max(16, Math.min(42, header.length + 6)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
  const columns = validColumns.length
    ? validColumns
    : [{ header: 'Instructions', values: ['Fill the Template sheet using these valid values.'] }]
  validSheet.addRow(columns.map((col) => col.header))
  validSheet.getRow(1).font = { bold: true }
  validSheet.views = [{ state: 'frozen', ySplit: 1 }]
  const maxRows = Math.max(0, ...columns.map((col) => (col.values || []).length))
  for (let i = 0; i < maxRows; i += 1) {
    validSheet.addRow(columns.map((col) => col.values?.[i] ?? ''))
  }
  validSheet.columns = columns.map((col) => ({
    width: Math.max(18, Math.min(56, col.header.length + 10)),
  }))

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function readTemplateRows(workbook, expectedColumns, { extraColumns = [] } = {}) {
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) {
    throw Object.assign(new Error('No worksheet found in file'), { status: 400 })
  }

  const headerRow = sheet.getRow(1)
  const columnByHeader = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value)
    if (header) columnByHeader.set(normalizeName(header), colNumber)
  })

  for (const col of expectedColumns) {
    if (!columnByHeader.has(normalizeName(col))) {
      throw Object.assign(
        new Error(`Missing column "${col}" in template. Download the latest sample file and try again.`),
        { status: 400 },
      )
    }
  }

  const columnsToRead = [...expectedColumns]
  for (const col of extraColumns) {
    if (!columnByHeader.has(normalizeName(col))) continue
    if (columnsToRead.some((existing) => normalizeName(existing) === normalizeName(col))) continue
    columnsToRead.push(col)
  }

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    for (const col of columnsToRead) {
      const colNumber = columnByHeader.get(normalizeName(col))
      if (!colNumber) continue
      rowValues[col] = cellToString(row.getCell(colNumber).value)
    }
    if (!columnsToRead.some((col) => rowValues[col])) continue
    rows.push({ rowNumber, rowValues })
  }
  return rows
}

export async function runBulkImport(buffer, columns, importRow, options = {}) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, columns, options)
  const results = { created: 0, failed: 0, errors: [], preview: [] }

  for (const { rowNumber, rowValues } of rows) {
    try {
      const preview = await importRow(rowValues, rowNumber)
      results.created += 1
      if (preview && results.preview.length < 250) {
        results.preview.push({ row: rowNumber, ...preview })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}

export function bufferFromBase64Upload(raw) {
  if (!raw || typeof raw !== 'string') {
    const err = new Error('File data is required')
    err.status = 400
    throw err
  }
  const base64 = raw.includes(',') ? raw.split(',').pop() : raw
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    const err = new Error('File data is invalid')
    err.status = 400
    throw err
  }
  return buffer
}

export function excelFilePayload(filename, buffer) {
  return {
    filename,
    contentType: XLSX_TYPE,
    data: buffer.toString('base64'),
  }
}
