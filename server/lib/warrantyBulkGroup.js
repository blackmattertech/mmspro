import { normalizeName } from './excelTemplate.js'

export const WARRANTY_IMPORT_COLUMNS = [
  'Vendor',
  'Contact Name',
  'Contact Phone',
  'Contact Email',
  'Product Name',
  'Model / P.No',
  'Value',
  'Make',
  'Purchase Date',
  'PO Number',
  'PO Date',
  'Invoice Number',
  'Invoice Date',
  'Warranty Start',
  'Warranty End',
  'Warranty Period (months)',
  'Expiry Notification (days)',
  'Remarks',
]

const DATE_FIELDS = [
  ['Purchase Date', 'purchase_date'],
  ['PO Date', 'po_date'],
  ['Invoice Date', 'invoice_date'],
  ['Warranty Start', 'warranty_start'],
  ['Warranty End', 'warranty_end'],
]

function issue(row, field, problem, suggestion) {
  const hint = suggestion ? ` ${suggestion}` : ''
  return {
    row,
    field,
    problem,
    suggestion: suggestion || '',
    message: `${field}: ${problem}${hint}`,
  }
}

function text(value) {
  return String(value ?? '').trim()
}

export function parseImportDate(raw) {
  const value = text(raw)
  if (!value) return { value: null }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dmy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  let year
  let month
  let day
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (dmy) {
    day = Number(dmy[1])
    month = Number(dmy[2])
    year = Number(dmy[3])
  } else {
    return { error: true }
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return { error: true }
  }
  return {
    value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

export function parseImportDecimal(raw) {
  const value = text(raw)
  if (!value) return { value: null }
  const cleaned = value.replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { error: true }
  return { value: Number(cleaned) }
}

export function parseImportInteger(raw) {
  const value = text(raw)
  if (!value) return { value: null }
  if (!/^\d+$/.test(value.replace(/,/g, ''))) return { error: true }
  return { value: Number(value.replace(/,/g, '')) }
}

export function itemSignature(item) {
  const value = item?.value == null || item.value === ''
    ? ''
    : Number(item.value).toFixed(2)
  return [
    normalizeName(item?.product_name),
    normalizeName(item?.model_part_no),
    value,
    text(item?.purchase_date),
  ].join('|')
}

/** Skip items that already exist on the purchase. Counts identical lines separately. */
export function takeNewItems(existingItems, incomingItems) {
  const counts = new Map()
  for (const item of existingItems || []) {
    const signature = itemSignature(item)
    counts.set(signature, (counts.get(signature) || 0) + 1)
  }
  const fresh = []
  for (const item of incomingItems || []) {
    const signature = itemSignature(item)
    const left = counts.get(signature) || 0
    if (left > 0) {
      counts.set(signature, left - 1)
      continue
    }
    fresh.push(item)
  }
  return fresh
}

export function formatRowSpan(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (sorted.length <= 1) return String(sorted[0] ?? '')
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1)
  return contiguous ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ')
}

function mergeErrors(errors) {
  const byRow = new Map()
  for (const error of errors) {
    const current = byRow.get(error.row)
    if (!current) {
      byRow.set(error.row, { ...error })
      continue
    }
    current.message = `${current.message} ${error.message}`
    if (!current.field.split(', ').includes(error.field)) {
      current.field = `${current.field}, ${error.field}`
    }
    current.problem = `${current.problem} ${error.problem}`
    if (error.suggestion) {
      current.suggestion = current.suggestion
        ? `${current.suggestion} ${error.suggestion}`
        : error.suggestion
    }
  }
  return [...byRow.values()].sort((a, b) => a.row - b.row)
}

function purchaseLabel(group) {
  const vendor = group.vendor?.name || 'this vendor'
  return `${vendor}, ${group.po_number}, ${group.invoice_number}`
}

/**
 * Validate rows and group them into purchases.
 * Group key is vendor + PO number + invoice number.
 * A purchase is not imported when any of its rows is invalid.
 */
export function planWarrantyImport(rows, matchVendor) {
  const errors = []
  const groups = []
  const groupsByKey = new Map()

  for (const { rowNumber, rowValues } of rows) {
    const rowErrors = []
    const vendorText = text(rowValues.Vendor)
    const poNumber = text(rowValues['PO Number'])
    const invoiceNumber = text(rowValues['Invoice Number'])
    const productName = text(rowValues['Product Name'])

    let vendor = null
    if (!vendorText) {
      rowErrors.push(issue(
        rowNumber,
        'Vendor',
        'Vendor is required.',
        'Enter the vendor name exactly as it appears in the vendor master.',
      ))
    } else {
      try {
        vendor = matchVendor(vendorText)
      } catch (err) {
        rowErrors.push(issue(
          rowNumber,
          'Vendor',
          err.message.endsWith('.') ? err.message : `${err.message}.`,
          'Choose a vendor from the Valid values sheet, or add the vendor in Masters first.',
        ))
      }
    }

    if (!productName) {
      rowErrors.push(issue(
        rowNumber,
        'Product Name',
        'Product name is required.',
        'Enter the product or material name for this item, for example VFD Panel.',
      ))
    }

    if (!poNumber) {
      rowErrors.push(issue(
        rowNumber,
        'PO Number',
        'PO number is required.',
        'Enter the purchase order number, for example PO-001. Rows are grouped by vendor, PO number, and invoice number.',
      ))
    }

    if (!invoiceNumber) {
      rowErrors.push(issue(
        rowNumber,
        'Invoice Number',
        'Invoice number is required.',
        'Enter the invoice number, for example INV-001. The same PO can contain more than one invoice, so invoice number is part of the purchase.',
      ))
    }

    const dates = {}
    for (const [label, key] of DATE_FIELDS) {
      const parsed = parseImportDate(rowValues[label])
      if (parsed.error) {
        rowErrors.push(issue(
          rowNumber,
          label,
          `"${text(rowValues[label])}" is not a valid date.`,
          'Use YYYY-MM-DD or DD/MM/YYYY, for example 2026-01-15.',
        ))
        dates[key] = null
      } else {
        dates[key] = parsed.value
      }
    }

    if (dates.warranty_start && dates.warranty_end && dates.warranty_end < dates.warranty_start) {
      rowErrors.push(issue(
        rowNumber,
        'Warranty End',
        'Warranty end is before warranty start.',
        'Enter a warranty end date on or after the warranty start date.',
      ))
    }

    const valueParsed = parseImportDecimal(rowValues.Value)
    if (valueParsed.error) {
      rowErrors.push(issue(
        rowNumber,
        'Value',
        `"${text(rowValues.Value)}" is not a valid amount.`,
        'Enter a numeric value, for example 85000.',
      ))
    }

    const periodParsed = parseImportInteger(rowValues['Warranty Period (months)'])
    if (periodParsed.error) {
      rowErrors.push(issue(
        rowNumber,
        'Warranty Period (months)',
        `"${text(rowValues['Warranty Period (months)'])}" is not a whole number of months.`,
        'Enter a whole number, for example 12, or leave the cell blank.',
      ))
    }

    const notifyParsed = parseImportInteger(rowValues['Expiry Notification (days)'])
    if (notifyParsed.error) {
      rowErrors.push(issue(
        rowNumber,
        'Expiry Notification (days)',
        `"${text(rowValues['Expiry Notification (days)'])}" is not a whole number of days.`,
        'Enter a whole number, for example 30, or leave the cell blank.',
      ))
    }

    const email = text(rowValues['Contact Email'])
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push(issue(
        rowNumber,
        'Contact Email',
        `"${email}" is not a valid email address.`,
        'Enter an email like service@vendor.com, or leave the cell blank.',
      ))
    }

    const phone = text(rowValues['Contact Phone'])
    if (phone && /[a-z]/i.test(phone)) {
      rowErrors.push(issue(
        rowNumber,
        'Contact Phone',
        `"${phone}" is not a valid phone number.`,
        'Use digits and phone symbols only, for example +91 98400 11223.',
      ))
    }

    const item = {
      product_name: productName || null,
      model_part_no: text(rowValues['Model / P.No']) || null,
      value: valueParsed.error ? null : valueParsed.value,
      make: text(rowValues.Make) || null,
      purchase_date: dates.purchase_date,
      remarks: text(rowValues.Remarks) || null,
      po_number: poNumber || null,
      po_date: dates.po_date,
      invoice_number: invoiceNumber || null,
      invoice_date: dates.invoice_date,
      warranty_start: dates.warranty_start,
      warranty_end: dates.warranty_end,
      warranty_period_months: periodParsed.error ? null : periodParsed.value,
      expiry_notification_days: notifyParsed.error ? null : notifyParsed.value,
    }

    const header = {
      contact_name: text(rowValues['Contact Name']) || null,
      contact_phone: phone || null,
      contact_email: email || null,
      po_date: dates.po_date,
      invoice_date: dates.invoice_date,
    }

    errors.push(...rowErrors)

    if (!vendor || !poNumber || !invoiceNumber) continue

    const key = `${vendor.id}|${normalizeName(poNumber)}|${normalizeName(invoiceNumber)}`
    let group = groupsByKey.get(key)
    if (!group) {
      group = {
        key,
        vendor,
        po_number: poNumber,
        invoice_number: invoiceNumber,
        contact_name: null,
        contact_phone: null,
        contact_email: null,
        po_date: null,
        invoice_date: null,
        sharedFrom: {},
        items: [],
        rowNumbers: [],
        blocked: false,
      }
      groupsByKey.set(key, group)
      groups.push(group)
    }

    group.rowNumbers.push(rowNumber)
    const sharedFields = [
      ['contact_name', header.contact_name, 'Contact Name'],
      ['contact_phone', header.contact_phone, 'Contact Phone'],
      ['contact_email', header.contact_email, 'Contact Email'],
      ['po_date', header.po_date, 'PO Date'],
      ['invoice_date', header.invoice_date, 'Invoice Date'],
    ]
    for (const [field, value, label] of sharedFields) {
      if (!value) continue
      if (!group[field]) {
        group[field] = value
        group.sharedFrom[field] = rowNumber
        continue
      }
      if (normalizeName(group[field]) === normalizeName(value)) continue
      group.blocked = true
      errors.push(issue(
        rowNumber,
        label,
        `${label} "${value}" does not match row ${group.sharedFrom[field]} ("${group[field]}") for the same purchase.`,
        `Use the same ${label.toLowerCase()} on every row for ${purchaseLabel(group)}.`,
      ))
    }

    if (rowErrors.length) {
      group.blocked = true
      continue
    }
    group.items.push({
      ...item,
      po_number: group.po_number,
      po_date: group.po_date,
      invoice_number: group.invoice_number,
      invoice_date: group.invoice_date,
    })
  }

  for (const group of groups) {
    for (const item of group.items) {
      item.po_number = group.po_number
      item.po_date = group.po_date
      item.invoice_number = group.invoice_number
      item.invoice_date = group.invoice_date
    }
  }

  for (const group of groups) {
    if (!group.blocked) continue
    const cause = errors.find((error) => group.rowNumbers.includes(error.row) && !error.companion)
    for (const rowNumber of group.rowNumbers) {
      if (errors.some((error) => error.row === rowNumber && !error.companion)) continue
      errors.push({
        ...issue(
          rowNumber,
          'Purchase',
          `This row was not imported because row ${cause?.row || rowNumber} in the same purchase (${purchaseLabel(group)}) has an error.`,
          'Fix the other row, then upload this purchase again. Valid rows in a purchase stay together so a partial record is not created.',
        ),
        companion: true,
      })
    }
  }

  return {
    rowCount: rows.length,
    errors: mergeErrors(errors),
    groups,
    formatRowSpan,
  }
}

export function summarizeWarrantyPlan({ dryRun, rowCount, groups, failed }) {
  const creating = groups.filter((group) => group.action === 'created')
  const updating = groups.filter((group) => group.action === 'updated')
  const unchanged = groups.filter((group) => group.action === 'unchanged')
  const purchases = creating.length + updating.length
  const tense = dryRun ? 'will be created' : 'created'
  const parts = [`${rowCount} row${rowCount === 1 ? '' : 's'} uploaded.`]

  if (creating.length) {
    const items = creating.reduce((sum, group) => sum + group.item_count, 0)
    parts.push(
      `${creating.length} purchase record${creating.length === 1 ? '' : 's'} ${tense} with ${items} item${items === 1 ? '' : 's'}.`,
    )
  }
  if (updating.length) {
    const items = updating.reduce((sum, group) => sum + group.item_count, 0)
    parts.push(
      dryRun
        ? `${updating.length} existing purchase record${updating.length === 1 ? '' : 's'} will gain ${items} item${items === 1 ? '' : 's'}.`
        : `${updating.length} existing purchase record${updating.length === 1 ? '' : 's'} gained ${items} item${items === 1 ? '' : 's'}.`,
    )
  }
  if (unchanged.length) {
    parts.push(
      `${unchanged.length} purchase record${unchanged.length === 1 ? '' : 's'} already ${unchanged.length === 1 ? 'has' : 'have'} these items.`,
    )
  }
  if (!creating.length && !updating.length && !unchanged.length && !failed) {
    parts.push('No purchase records were found in the file.')
  }
  if (failed) {
    parts.push(
      `${failed} row${failed === 1 ? '' : 's'} ${dryRun ? 'need' : 'had'} a correction and ${dryRun ? 'will not be imported' : 'were not imported'}.`,
    )
  }
  if (!purchases && unchanged.length && !failed) {
    parts.push('No duplicate purchase records were created.')
  }
  return parts.join(' ')
}
