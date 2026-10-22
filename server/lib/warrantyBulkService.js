import ExcelJS from 'exceljs'
import {
  appendWarrantyItems,
  createWarranty,
  findPurchaseWarranty,
  getWarrantyDetail,
} from './warrantyService.js'
import { buildWorkbook, readTemplateRows } from './excelTemplate.js'
import { loadFormMasters, optionalMatch } from './formBulkLookups.js'
import {
  WARRANTY_IMPORT_COLUMNS,
  formatRowSpan,
  planWarrantyImport,
  summarizeWarrantyPlan,
  takeNewItems,
} from './warrantyBulkGroup.js'

function vendorLabel(vendor) {
  if (!vendor) return ''
  return vendor.vendor_code ? `${vendor.name} (${vendor.vendor_code})` : vendor.name
}

export async function buildWarrantiesTemplate(orgId) {
  const masters = await loadFormMasters(orgId)
  const vendor = masters.vendors[0]
  const vendorName = vendor ? vendorLabel(vendor) : 'Siemens'
  const shared = {
    Vendor: vendorName,
    'Contact Name': 'Service desk',
    'Contact Phone': '+91 98400 11223',
    'Contact Email': 'service@siemens.example',
    'PO Number': 'PO-001',
    'PO Date': '2026-01-15',
    'Invoice Number': 'INV-001',
    'Invoice Date': '2026-01-16',
  }
  return buildWorkbook(WARRANTY_IMPORT_COLUMNS, [
    {
      header: 'Vendor',
      values: masters.vendors.map((row) => vendorLabel(row)),
    },
    {
      header: 'How rows are grouped',
      values: [
        'One item per row.',
        'Rows with the same Vendor, PO Number, and Invoice Number become one purchase.',
        'Do not put Item 1, Item 2, and Item 3 in separate columns.',
        'Example: PO-001 | INV-001 | VFD Panel, HMI, and PLC creates 1 purchase with 3 items.',
        'A different invoice number on the same PO creates a separate purchase.',
      ],
    },
  ], {
    sampleRows: [
      {
        ...shared,
        'Product Name': 'VFD Panel',
        'Model / P.No': 'G120-7.5',
        Value: '85000',
        Make: 'Siemens',
        'Purchase Date': '2026-01-15',
        'Warranty Start': '2026-01-15',
        'Warranty End': '2027-01-14',
        'Warranty Period (months)': '12',
        'Expiry Notification (days)': '30',
        Remarks: 'Main drive',
      },
      {
        ...shared,
        'Product Name': 'HMI',
        'Model / P.No': 'KTP700',
        Value: '45000',
        Make: 'Siemens',
        'Purchase Date': '2026-01-15',
        'Warranty Start': '2026-01-15',
        'Warranty End': '2028-01-14',
        'Warranty Period (months)': '24',
        'Expiry Notification (days)': '30',
        Remarks: 'Operator panel',
      },
      {
        ...shared,
        'Product Name': 'PLC',
        'Model / P.No': 'S7-1200',
        Value: '62000',
        Make: 'Siemens',
        'Purchase Date': '2026-01-15',
        'Warranty Start': '2026-01-15',
        'Warranty End': '2027-07-14',
        'Warranty Period (months)': '18',
        'Expiry Notification (days)': '30',
        Remarks: 'Controller',
      },
    ],
  })
}

function groupResult(group, { action, serialNumber, itemCount, itemNames }) {
  const labels = {
    created: 'Created',
    updated: 'Added items',
    unchanged: 'Already imported',
    blocked: 'Needs correction',
  }
  const dryLabels = {
    created: 'Will create',
    updated: 'Will add items',
    unchanged: 'Already imported',
    blocked: 'Needs correction',
  }
  return {
    vendor: group.vendor?.name || '',
    vendor_id: group.vendor?.id || null,
    po_number: group.po_number,
    invoice_number: group.invoice_number,
    item_count: itemCount,
    item_names: itemNames,
    action,
    action_label: labels[action] || action,
    dry_action_label: dryLabels[action] || action,
    serial_number: serialNumber || '',
    rows: group.rowNumbers,
    row_label: formatRowSpan(group.rowNumbers),
  }
}

function previewRow(group) {
  return {
    row: group.row_label,
    name: group.serial_number || '',
    vendor: group.vendor,
    reference: `${group.po_number} / ${group.invoice_number}`,
    items: `${group.item_count} item${group.item_count === 1 ? '' : 's'}`,
    action: group.action_label,
  }
}

export async function bulkImportWarranties(orgId, buffer, { dryRun = false } = {}) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, WARRANTY_IMPORT_COLUMNS)
  const masters = await loadFormMasters(orgId)
  const plan = planWarrantyImport(rows, (value) => (
    optionalMatch(masters.vendors, value, 'Vendor', ['name', 'vendor_code'])
  ))

  const groups = []
  let created = 0
  let updated = 0
  let skipped = 0
  let itemsCreated = 0

  for (const group of plan.groups) {
    if (group.blocked || !group.items.length) {
      groups.push(groupResult(group, {
        action: 'blocked',
        itemCount: group.items.length,
        itemNames: group.items.map((item) => item.product_name).filter(Boolean),
      }))
      continue
    }

    try {
      const existing = await findPurchaseWarranty(orgId, {
        vendorId: group.vendor.id,
        vendorName: group.vendor.name,
        poNumber: group.po_number,
        invoiceNumber: group.invoice_number,
      })

      if (!existing) {
        let serialNumber = ''
        if (!dryRun) {
          const saved = await createWarranty(orgId, {
            vendor_id: group.vendor.id,
            vendor: group.vendor.name,
            contact_name: group.contact_name,
            contact_phone: group.contact_phone,
            contact_email: group.contact_email,
            items: group.items,
          })
          serialNumber = saved.serial_number || ''
        }
        created += 1
        itemsCreated += group.items.length
        groups.push(groupResult(group, {
          action: 'created',
          serialNumber,
          itemCount: group.items.length,
          itemNames: group.items.map((item) => item.product_name).filter(Boolean),
        }))
        continue
      }

      const detail = await getWarrantyDetail(orgId, existing.id)
      const fresh = takeNewItems(detail?.items || [], group.items)
      if (!fresh.length) {
        skipped += 1
        groups.push(groupResult(group, {
          action: 'unchanged',
          serialNumber: existing.serial_number,
          itemCount: group.items.length,
          itemNames: group.items.map((item) => item.product_name).filter(Boolean),
        }))
        continue
      }

      let serialNumber = existing.serial_number || ''
      if (!dryRun) {
        const saved = await appendWarrantyItems(orgId, existing.id, fresh)
        serialNumber = saved?.serial_number || serialNumber
      }
      updated += 1
      itemsCreated += fresh.length
      groups.push(groupResult(group, {
        action: 'updated',
        serialNumber,
        itemCount: fresh.length,
        itemNames: fresh.map((item) => item.product_name).filter(Boolean),
      }))
    } catch (err) {
      for (const rowNumber of group.rowNumbers) {
        const message = `Purchase: ${err.message} Fix this purchase and upload it again.`
        const existing = plan.errors.find((error) => error.row === rowNumber)
        if (existing) {
          existing.message = `${existing.message} ${message}`
          continue
        }
        plan.errors.push({
          row: rowNumber,
          field: 'Purchase',
          problem: err.message,
          suggestion: 'Fix this purchase and upload it again.',
          message,
        })
      }
      groups.push(groupResult(group, {
        action: 'blocked',
        itemCount: group.items.length,
        itemNames: group.items.map((item) => item.product_name).filter(Boolean),
      }))
    }
  }

  const failed = new Set(plan.errors.map((error) => error.row)).size
  const visibleGroups = groups.filter((group) => group.action !== 'blocked')
  const summary = summarizeWarrantyPlan({
    dryRun,
    rowCount: plan.rowCount,
    groups: visibleGroups,
    failed,
  })

  return {
    dry_run: dryRun,
    created,
    updated,
    skipped,
    failed,
    items_created: itemsCreated,
    rows: plan.rowCount,
    summary,
    groups: groups.map(({ dry_action_label, ...group }) => ({
      ...group,
      action_label: dryRun ? dry_action_label : group.action_label,
    })),
    errors: plan.errors.sort((a, b) => a.row - b.row),
    preview: visibleGroups.slice(0, 250).map((group) => ({
      ...previewRow(group),
      action: dryRun ? group.dry_action_label : group.action_label,
    })),
  }
}
