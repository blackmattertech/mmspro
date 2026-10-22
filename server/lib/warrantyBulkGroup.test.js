import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planWarrantyImport,
  takeNewItems,
  parseImportDate,
  parseImportDecimal,
} from './warrantyBulkGroup.js'

const vendors = [
  { id: 'vendor-siemens', name: 'Siemens', vendor_code: 'SIE' },
  { id: 'vendor-abb', name: 'ABB', vendor_code: 'ABB' },
]

function matchVendor(value) {
  const text = String(value || '').trim().toLowerCase()
  const vendor = vendors.find((row) => (
    row.name.toLowerCase() === text
    || row.vendor_code.toLowerCase() === text
    || text.startsWith(`${row.name.toLowerCase()} (`)
  ))
  if (!vendor) throw new Error(`Unknown vendor "${value}"`)
  return vendor
}

function row(rowNumber, values) {
  return { rowNumber, rowValues: values }
}

function base(overrides = {}) {
  return {
    Vendor: 'Siemens',
    'Contact Name': 'Service desk',
    'Contact Phone': '9840011223',
    'Contact Email': 'service@siemens.example',
    'PO Number': 'PO-001',
    'PO Date': '2026-01-15',
    'Invoice Number': 'INV-001',
    'Invoice Date': '2026-01-16',
    'Product Name': 'VFD Panel',
    'Model / P.No': 'G120',
    Value: '85000',
    Make: 'Siemens',
    'Purchase Date': '2026-01-15',
    'Warranty Start': '2026-01-15',
    'Warranty End': '2027-01-14',
    'Warranty Period (months)': '12',
    'Expiry Notification (days)': '30',
    Remarks: 'Main drive',
    ...overrides,
  }
}

test('groups the same vendor, PO, and invoice into one purchase', () => {
  const plan = planWarrantyImport([
    row(2, base({ 'Product Name': 'VFD Panel', Value: '85000' })),
    row(3, base({ 'Product Name': 'HMI', Value: '45000', 'Model / P.No': 'KTP700' })),
    row(4, base({ 'Product Name': 'PLC', Value: '62000', 'Model / P.No': 'S7-1200' })),
  ], matchVendor)

  assert.equal(plan.errors.length, 0)
  assert.equal(plan.groups.length, 1)
  assert.equal(plan.groups[0].blocked, false)
  assert.deepEqual(
    plan.groups[0].items.map((item) => item.product_name),
    ['VFD Panel', 'HMI', 'PLC'],
  )
  assert.deepEqual(
    plan.groups[0].items.map((item) => item.value),
    [85000, 45000, 62000],
  )
  assert.equal(plan.groups[0].po_number, 'PO-001')
  assert.equal(plan.groups[0].invoice_number, 'INV-001')
})

test('does not group rows that share only a PO number', () => {
  const plan = planWarrantyImport([
    row(2, base({ 'Invoice Number': 'INV-001', 'Product Name': 'VFD Panel' })),
    row(3, base({ 'Invoice Number': 'INV-002', 'Product Name': 'HMI' })),
    row(4, base({ Vendor: 'ABB', 'Invoice Number': 'INV-001', 'Product Name': 'PLC' })),
  ], matchVendor)

  assert.equal(plan.errors.length, 0)
  assert.equal(plan.groups.length, 3)
  assert.deepEqual(
    plan.groups.map((group) => `${group.vendor.name}|${group.po_number}|${group.invoice_number}`),
    ['Siemens|PO-001|INV-001', 'Siemens|PO-001|INV-002', 'ABB|PO-001|INV-001'],
  )
})

test('keeps a purchase together when one of its rows is invalid', () => {
  const plan = planWarrantyImport([
    row(2, base({ 'Product Name': 'VFD Panel' })),
    row(3, base({ 'Product Name': 'HMI', Value: 'not-a-number' })),
    row(4, base({ Vendor: 'ABB', 'PO Number': 'PO-002', 'Invoice Number': 'INV-002', 'Product Name': 'Drive' })),
  ], matchVendor)

  assert.equal(plan.groups.filter((group) => !group.blocked).length, 1)
  assert.equal(plan.groups.find((group) => group.vendor.name === 'Siemens').blocked, true)
  const fields = plan.errors.map((error) => `${error.row}:${error.field}`)
  assert.ok(fields.some((field) => field.startsWith('3:Value')))
  assert.ok(fields.some((field) => field.startsWith('2:Purchase')))
  assert.equal(plan.groups.find((group) => group.vendor.name === 'ABB').items.length, 1)
})

test('reports the row, field, and a correction for invalid values', () => {
  const plan = planWarrantyImport([
    row(2, base({
      Vendor: '',
      'Product Name': '',
      'PO Number': '',
      'Invoice Number': '',
      Value: 'abc',
      'Purchase Date': '32/13/2026',
      'Warranty Period (months)': '12 months',
      'Expiry Notification (days)': '-1',
    })),
  ], matchVendor)

  const fields = plan.errors.map((error) => error.field).join(' ')
  assert.match(fields, /Vendor/)
  assert.match(fields, /Product Name/)
  assert.match(fields, /PO Number/)
  assert.match(fields, /Invoice Number/)
  assert.match(plan.errors[0].message, /Row|Vendor|required|Enter/i)
  assert.ok(plan.errors.every((error) => error.row === 2 && error.suggestion))
})

test('does not treat a repeated item as a new line on the same purchase', () => {
  const existing = [{
    product_name: 'VFD Panel',
    model_part_no: 'G120',
    value: '85000.00',
    purchase_date: '2026-01-15',
  }]
  const incoming = [
    { product_name: 'VFD Panel', model_part_no: 'G120', value: 85000, purchase_date: '2026-01-15' },
    { product_name: 'HMI', model_part_no: 'KTP700', value: 45000, purchase_date: '2026-01-15' },
  ]
  const fresh = takeNewItems(existing, incoming)
  assert.deepEqual(fresh.map((item) => item.product_name), ['HMI'])
})

test('parses ISO and day-month dates and numeric values', () => {
  assert.equal(parseImportDate('2026-01-15').value, '2026-01-15')
  assert.equal(parseImportDate('15/01/2026').value, '2026-01-15')
  assert.equal(parseImportDate('31/02/2026').error, true)
  assert.equal(parseImportDecimal('₹85,000').value, 85000)
  assert.equal(parseImportDecimal('abc').error, true)
})
