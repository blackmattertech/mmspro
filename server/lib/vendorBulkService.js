import ExcelJS from 'exceljs'
import { CITIES_BY_STATE, getAllIndianCities, getStateForCity, parseCityName } from './indiaLocations.js'
import { createVendor } from './vendorService.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'

const TEMPLATE_COLUMNS = [
  'Vendor ID',
  'Vendor Name',
  'Contact Person',
  'Mobile',
  'Email',
  'Address Line 1',
  'Address Line 2',
  'Pincode',
  'City',
  'State',
  'GSTIN',
  'PAN',
  'Bank A/c Number',
  'Bank Name',
  'Account Name',
  'IFSC Code',
  'Branch',
]

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

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

function rowToVendorBody(rowValues) {
  const city = parseCityName(rowValues.City)
  const state = String(rowValues.State || '').trim() || (city ? getStateForCity(city) : '')

  return {
    vendor_code: rowValues['Vendor ID'] || undefined,
    name: rowValues['Vendor Name'],
    contact_person: rowValues['Contact Person'],
    mobile: rowValues.Mobile,
    email: rowValues.Email,
    address_line1: rowValues['Address Line 1'],
    address_line2: rowValues['Address Line 2'],
    pincode: rowValues.Pincode,
    city,
    state,
    gstin: rowValues.GSTIN,
    pan: rowValues.PAN,
    bank_account_number: rowValues['Bank A/c Number'],
    bank_name: rowValues['Bank Name'],
    account_name: rowValues['Account Name'],
    ifsc_code: rowValues['IFSC Code'],
    branch: rowValues.Branch,
  }
}

export async function buildVendorsTemplate() {
  const cities = getAllIndianCities()
  const states = Object.keys(CITIES_BY_STATE).sort((a, b) => a.localeCompare(b))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  templateSheet.addRow(TEMPLATE_COLUMNS)
  templateSheet.getRow(1).font = { bold: true }
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  templateSheet.columns = TEMPLATE_COLUMNS.map((header) => ({
    width: Math.max(16, Math.min(40, header.length + 6)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
  const validColumns = [
    {
      header: 'City',
      values: cities.map(({ city }) => city),
    },
    {
      header: 'State',
      values: states,
    },
    {
      header: 'Vendor ID format',
      values: ['Ven-0001 (optional — leave blank to auto-generate)'],
    },
    {
      header: 'Mobile format',
      values: ['10-digit Indian mobile or +91 prefix'],
    },
    {
      header: 'GSTIN',
      values: ['Optional — enter as provided on vendor records'],
    },
    {
      header: 'IFSC format',
      values: ['11-character IFSC code (e.g. HDFC0001234)'],
    },
  ]

  validSheet.addRow(validColumns.map((col) => col.header))
  validSheet.getRow(1).font = { bold: true }
  validSheet.views = [{ state: 'frozen', ySplit: 1 }]
  const maxRows = Math.max(0, ...validColumns.map((col) => col.values.length))
  for (let i = 0; i < maxRows; i += 1) {
    validSheet.addRow(validColumns.map((col) => col.values[i] ?? ''))
  }
  validSheet.columns = validColumns.map((col) => ({
    width: Math.max(18, Math.min(52, col.header.length + 10)),
  }))

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function bulkImportVendors(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) throw Object.assign(new Error('No worksheet found in file'), { status: 400 })

  const headerRow = sheet.getRow(1)
  const columnByHeader = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value)
    if (header) columnByHeader.set(normalizeName(header), colNumber)
  })

  for (const col of TEMPLATE_COLUMNS) {
    if (!columnByHeader.has(normalizeName(col))) {
      throw Object.assign(
        new Error(`Missing column "${col}" in template. Download the latest template and try again.`),
        { status: 400 },
      )
    }
  }

  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    for (const col of TEMPLATE_COLUMNS) {
      const colNumber = columnByHeader.get(normalizeName(col))
      rowValues[col] = cellToString(row.getCell(colNumber).value)
    }

    if (!TEMPLATE_COLUMNS.some((col) => rowValues[col])) continue

    try {
      if (!rowValues['Vendor Name']?.trim()) throw new Error('Vendor Name is required')
      const created = await createVendor(orgId, rowToVendorBody(rowValues))
      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          vendor_code: created.vendor_code || '',
          name: created.name || '',
          contact_person: created.contact_person || '',
          mobile: created.mobile || '',
          city: created.city || '',
          gstin: created.gstin || '',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
