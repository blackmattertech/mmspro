import { createWarranty } from './warrantyService.js'
import {
  buildWorkbook,
  cellToDate,
  runBulkImport,
} from './excelTemplate.js'
import {
  loadFormMasters,
  optionalMatch,
} from './formBulkLookups.js'
import {
  numberedGroupColumns,
  readNumberedGroup,
} from './formBulkColumns.js'

const ITEM_SPECS = [
  { key: 'product_name', header: 'Product Name' },
  { key: 'model_part_no', header: 'Model / P.No' },
  { key: 'value', header: 'Value' },
  { key: 'remarks', header: 'Remarks' },
]

const CORE_COLUMNS = [
  'Make',
  'Vendor',
  'Purchase Date',
  'PO Number',
  'PO Date',
  'Invoice Number',
  'Invoice Date',
  'Warranty Start',
  'Warranty End',
  'Warranty Period (months)',
  'Expiry Notification (days)',
  'Contact Name',
  'Contact Phone',
  'Contact Email',
  ...numberedGroupColumns('Item', ITEM_SPECS, 3),
]

export async function buildWarrantiesTemplate(orgId) {
  const masters = await loadFormMasters(orgId)
  return buildWorkbook(CORE_COLUMNS, [
    { header: 'Vendor', values: masters.vendors.map((row) => row.vendor_code ? `${row.name} (${row.vendor_code})` : row.name) },
  ], {
    sampleRow: {
      Make: 'Siemens',
      'Purchase Date': '2026-01-15',
      'Warranty Start': '2026-01-15',
      'Warranty End': '2027-01-14',
      'Warranty Period (months)': '12',
      'Expiry Notification (days)': '30',
      'Contact Name': 'Service desk',
      'Item 1 Product Name': 'VFD panel',
      'Item 1 Model / P.No': 'G120-7.5',
      'Item 1 Value': '85000',
      'Item 1 Remarks': 'Main drive',
      'Item 2 Product Name': 'HMI',
      'Item 2 Model / P.No': 'KTP700',
    },
  })
}

export async function bulkImportWarranties(orgId, buffer) {
  const masters = await loadFormMasters(orgId)
  return runBulkImport(buffer, CORE_COLUMNS, async (row) => {
    const vendor = optionalMatch(masters.vendors, row.Vendor, 'Vendor', ['name', 'vendor_code'])
    const items = readNumberedGroup(row, 'Item', ITEM_SPECS, 3)
    const created = await createWarranty(orgId, {
      make: row.Make,
      vendor_id: vendor?.id || null,
      vendor: vendor?.name || row.Vendor || null,
      purchase_date: cellToDate(row['Purchase Date']) || row['Purchase Date'] || null,
      po_number: row['PO Number'] || null,
      po_date: cellToDate(row['PO Date']) || row['PO Date'] || null,
      invoice_number: row['Invoice Number'] || null,
      invoice_date: cellToDate(row['Invoice Date']) || row['Invoice Date'] || null,
      warranty_start: cellToDate(row['Warranty Start']) || row['Warranty Start'] || null,
      warranty_end: cellToDate(row['Warranty End']) || row['Warranty End'] || null,
      warranty_period_months: row['Warranty Period (months)'] || null,
      expiry_notification_days: row['Expiry Notification (days)'] || null,
      contact_name: row['Contact Name'] || null,
      contact_phone: row['Contact Phone'] || null,
      contact_email: row['Contact Email'] || null,
      items,
    })

    return {
      name: created.serial_number || created.make || items[0]?.product_name || '',
      vendor: created.vendor || vendor?.name || '',
      make: created.make || row.Make || '',
    }
  })
}
