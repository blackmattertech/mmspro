import ExcelJS from 'exceljs'

const TEMPLATE_SHEET = 'Template'
export const IMPORT_ERROR_COLUMN = 'Import errors'

function cellToString(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if (value.text) return String(value.text)
    if (value.result != null) return String(value.result)
    if (value.richText) return value.richText.map((r) => r.text).join('')
    return ''
  }
  return String(value).trim()
}

/** Workbook with only failed rows and an error column for correction and re-upload. */
export async function buildFailedRowsWorkbook(sourceBuffer, errors) {
  if (!errors?.length) return null

  const sourceWb = new ExcelJS.Workbook()
  await sourceWb.xlsx.load(sourceBuffer)
  const sourceSheet = sourceWb.getWorksheet(TEMPLATE_SHEET) || sourceWb.worksheets[0]
  if (!sourceSheet) return null

  const headerRow = sourceSheet.getRow(1)
  const headerCells = []
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const label = cellToString(cell.value)
    if (label !== IMPORT_ERROR_COLUMN) {
      headerCells.push({ colNumber, label })
    }
  })
  if (!headerCells.length) return null

  const headers = headerCells.map((c) => c.label)

  const outWb = new ExcelJS.Workbook()
  outWb.creator = 'MMS Pro'
  const outSheet = outWb.addWorksheet(sourceSheet.name || TEMPLATE_SHEET)
  outSheet.addRow([...headers, IMPORT_ERROR_COLUMN])
  outSheet.getRow(1).font = { bold: true }
  outSheet.views = [{ state: 'frozen', ySplit: 1 }]

  const errorsByRow = new Map(errors.map((e) => [e.row, e.message]))
  const sortedRows = [...errorsByRow.keys()].sort((a, b) => a - b)

  for (const rowNumber of sortedRows) {
    const sourceRow = sourceSheet.getRow(rowNumber)
    const values = headerCells.map(({ colNumber }) => cellToString(sourceRow.getCell(colNumber).value))
    values.push(errorsByRow.get(rowNumber) || '')
    outSheet.addRow(values)
  }

  outSheet.columns = [...headers, IMPORT_ERROR_COLUMN].map((header) => ({
    width: Math.max(16, Math.min(52, String(header).length + 8)),
  }))

  const buffer = await outWb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function attachFailedFileToResult(result, sourceBuffer, filename) {
  if (!result?.errors?.length || !sourceBuffer?.length) return result
  return buildFailedRowsWorkbook(sourceBuffer, result.errors).then((failedBuffer) => {
    if (!failedBuffer) return result
    return {
      ...result,
      failedFile: {
        filename: filename || 'import-failed-rows.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: failedBuffer.toString('base64'),
      },
    }
  })
}
