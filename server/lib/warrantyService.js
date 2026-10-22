import { supabaseAdmin } from '../services/supabase.js'
import {
  uploadWarrantyDocumentFile,
  getWarrantyDocumentSignedUrl,
  deleteWarrantyDocumentFile,
} from './warrantyDocumentStorage.js'
import { applyMappedFilters, ilikePattern, listEnvelope } from './listQuery.js'
import { NO_MATCH_ID, restrictToIds } from './relationFilters.js'
import { attachFormFieldValueMaps } from './orgFormLayouts.js'
import { clipTrimmedToLimit, getTextFieldLimitsMap } from './textFieldLimits.js'

const WARRANTY_SELECT = `
  id, org_id, serial_number,
  purchase_date, make,
  po_number, po_date,
  invoice_number, invoice_date,
  warranty_start, warranty_end,
  warranty_period_months, expiry_notification_days,
  vendor_id, vendor, contact_name, contact_phone, contact_email,
  created_at, updated_at,
  vendor_record:vendor_id (
    id, vendor_code, name, contact_person, mobile, email
  )
`

const WARRANTY_ITEMS_SELECT = `
  warranty_items (
    id, line_number, product_name, model_part_no, value, remarks,
    purchase_date, make, po_number, po_date,
    invoice_number, invoice_date,
    warranty_start, warranty_end,
    warranty_period_months, expiry_notification_days
  )
`

const WARRANTY_LIST_SELECT = WARRANTY_SELECT.trim()

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function parseDate(value) {
  const text = trimOrNull(value)
  return text || null
}

function parseInteger(value) {
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? Math.round(num) : null
}

function parseDecimal(value) {
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function itemHasContent(item) {
  return Boolean(
    item.product_name
    || item.model_part_no
    || item.value != null
    || item.remarks
    || item.purchase_date
    || item.make
    || item.po_number
    || item.po_date
    || item.invoice_number
    || item.invoice_date
    || item.warranty_start
    || item.warranty_end
    || item.warranty_period_months != null
    || item.expiry_notification_days != null
    || item.keep_line === true,
  )
}

function normalizeItems(items, limits = null) {
  if (!Array.isArray(items)) return []
  return items
    .map((item, index) => ({
      line_number: index + 1,
      product_name: trimOrNull(item.product_name),
      model_part_no: trimOrNull(item.model_part_no),
      value: parseDecimal(item.value),
      remarks: limits
        ? clipTrimmedToLimit(limits, 'remarks', item.remarks)
        : trimOrNull(item.remarks),
      purchase_date: parseDate(item.purchase_date),
      make: trimOrNull(item.make),
      po_number: trimOrNull(item.po_number),
      po_date: parseDate(item.po_date),
      invoice_number: trimOrNull(item.invoice_number),
      invoice_date: parseDate(item.invoice_date),
      warranty_start: parseDate(item.warranty_start),
      warranty_end: parseDate(item.warranty_end),
      warranty_period_months: parseInteger(item.warranty_period_months),
      expiry_notification_days: parseInteger(item.expiry_notification_days),
    }))
    .filter(itemHasContent)
}

/** Keep header commercial fields as rollups for list/status/calendar. */
function rollupWarrantyFromItems(items = [], vendorPayload = {}) {
  const ends = items
    .map((item) => item.warranty_end)
    .filter(Boolean)
    .sort()
  const starts = items
    .map((item) => item.warranty_start)
    .filter(Boolean)
    .sort()
  const purchases = items
    .map((item) => item.purchase_date)
    .filter(Boolean)
    .sort()
  const soonestEnd = ends[0] || null
  const soonestItem = items.find((item) => item.warranty_end === soonestEnd) || items[0] || null
  const firstWith = (key) => items.find((item) => item[key])?.[key] || null

  return {
    ...vendorPayload,
    purchase_date: purchases[0] || null,
    make: firstWith('make'),
    po_number: firstWith('po_number'),
    po_date: firstWith('po_date'),
    invoice_number: firstWith('invoice_number'),
    invoice_date: firstWith('invoice_date'),
    warranty_start: starts[0] || null,
    warranty_end: soonestEnd,
    warranty_period_months: soonestItem?.warranty_period_months ?? null,
    expiry_notification_days: soonestItem?.expiry_notification_days ?? null,
  }
}

function normalizeWarrantyPayload(body) {
  return {
    vendor_id: trimOrNull(body.vendor_id) || null,
    vendor: trimOrNull(body.vendor),
    contact_name: trimOrNull(body.contact_name),
    contact_phone: trimOrNull(body.contact_phone),
    contact_email: trimOrNull(body.contact_email),
  }
}

async function resolveVendorFields(orgId, payload) {
  if (!payload.vendor_id) return payload

  const { data: vendor, error } = await supabaseAdmin
    .from('vendors')
    .select('id, vendor_code, name, contact_person, mobile, email')
    .eq('org_id', orgId)
    .eq('id', payload.vendor_id)
    .maybeSingle()

  if (error) throw error
  if (!vendor) {
    const err = new Error('Selected vendor was not found')
    err.status = 400
    throw err
  }

  return {
    ...payload,
    vendor_id: vendor.id,
    vendor: vendor.name,
    contact_name: payload.contact_name || vendor.contact_person || null,
    contact_phone: payload.contact_phone || vendor.mobile || null,
    contact_email: payload.contact_email || vendor.email || null,
  }
}

function warrantyStatusKey(row, now = new Date()) {
  if (!row?.warranty_end) return 'active'
  const end = new Date(`${String(row.warranty_end).slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return 'active'
  if (end < now) return 'expired'
  const notifyDays = Number(row.expiry_notification_days)
  const windowDays = Number.isFinite(notifyDays) && notifyDays >= 0 ? notifyDays : 30
  const soon = new Date(now)
  soon.setDate(soon.getDate() + windowDays)
  if (end <= soon) return 'expiring_soon'
  return 'active'
}

async function countWarrantyStatuses(orgId, { search = null } = {}) {
  const map = new Map()
  const pageSize = 1000
  let from = 0
  const term = trimOrNull(search)
  const itemWarrantyIds = term ? await findWarrantyIdsByItemSearch(orgId, term) : []

  for (;;) {
    let query = supabaseAdmin
      .from('warranties')
      .select('warranty_end, expiry_notification_days')
      .eq('org_id', orgId)
      .range(from, from + pageSize - 1)

    if (term) {
      const q = term.replace(/%/g, '')
      const filters = [
        `serial_number.ilike.%${q}%`,
        `make.ilike.%${q}%`,
        `vendor.ilike.%${q}%`,
        `po_number.ilike.%${q}%`,
        `invoice_number.ilike.%${q}%`,
        `contact_name.ilike.%${q}%`,
        `contact_email.ilike.%${q}%`,
      ]
      if (itemWarrantyIds.length) {
        filters.push(`id.in.(${itemWarrantyIds.join(',')})`)
      }
      query = query.or(filters.join(','))
    }

    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      const key = warrantyStatusKey(row)
      map.set(key, (map.get(key) || 0) + 1)
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from >= 100_000) break
  }

  return [...map.entries()].map(([status, count]) => ({ status, count }))
}

function enrichWarrantyRow(row) {
  if (!row) return row
  const vendorRecord = row.vendor_record || null
  const vendorName = vendorRecord?.name || row.vendor || null
  const rawItems = row.items || row.warranty_items || []
  const items = [...rawItems].sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
  const { warranty_items: _warrantyItems, ...rest } = row
  return {
    ...rest,
    vendor: vendorName,
    vendor_record: vendorRecord,
    items,
  }
}

async function findWarrantyIdsByItemSearch(orgId, term) {
  const q = term.replace(/%/g, '')
  const { data, error } = await supabaseAdmin
    .from('warranty_items')
    .select('warranty_id')
    .eq('org_id', orgId)
    .or([
      `product_name.ilike.%${q}%`,
      `model_part_no.ilike.%${q}%`,
      `remarks.ilike.%${q}%`,
      `make.ilike.%${q}%`,
      `po_number.ilike.%${q}%`,
      `invoice_number.ilike.%${q}%`,
    ].join(','))

  if (error) throw error
  return [...new Set((data || []).map((row) => row.warranty_id).filter(Boolean))]
}

const WARRANTY_SERIAL_RE = /^WM\/(\d{4})\/(\d+)$/i

function formatWarrantySerial(year, sequence) {
  return `WM/${year}/${String(sequence).padStart(4, '0')}`
}

function parseWarrantySerial(value) {
  const match = String(value || '').trim().match(WARRANTY_SERIAL_RE)
  if (!match) return null
  return { year: Number(match[1]), sequence: Number(match[2]) }
}

async function nextSerialNumber(orgId) {
  const year = new Date().getFullYear()
  const prefix = `WM/${year}/`

  const { data, error } = await supabaseAdmin
    .from('warranties')
    .select('serial_number')
    .eq('org_id', orgId)
    .like('serial_number', `${prefix}%`)

  if (error) throw error

  let max = 0
  for (const row of data || []) {
    const parsed = parseWarrantySerial(row.serial_number)
    if (parsed?.year === year) {
      max = Math.max(max, parsed.sequence)
    }
  }

  return formatWarrantySerial(year, max + 1)
}

async function loadDocuments(orgId, warrantyId) {
  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, line_number, created_at')
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .order('sort_order', { ascending: true })

  if (error) throw error

  return Promise.all((data || []).map(async (doc) => ({
    ...doc,
    signed_url: await getWarrantyDocumentSignedUrl(doc.storage_path),
  })))
}

async function nextDocumentSortOrder(orgId, warrantyId) {
  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .select('sort_order')
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data?.sort_order ?? 0) + 1
}

function normalizeDocumentLabel(label) {
  const text = String(label || '').trim()
  return text.slice(0, 120) || 'Other'
}

function parseDocumentLineNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num) || num < 1 || num > 500) return null
  return num
}

export async function addWarrantyDocument(orgId, warrantyId, body) {
  const label = normalizeDocumentLabel(body.label)
  const uploaded = await uploadWarrantyDocumentFile(orgId, warrantyId, body)
  const sort_order = await nextDocumentSortOrder(orgId, warrantyId)

  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .insert({
      org_id: orgId,
      warranty_id: warrantyId,
      label,
      file_name: uploaded.fileName,
      storage_path: uploaded.path,
      file_size: uploaded.fileSize,
      content_type: uploaded.contentType,
      sort_order,
      line_number: parseDocumentLineNumber(body.line_number),
    })
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, line_number, created_at')
    .single()

  if (error) throw error

  return {
    ...data,
    signed_url: await getWarrantyDocumentSignedUrl(data.storage_path),
  }
}

export async function updateWarrantyDocument(orgId, warrantyId, documentId, body = {}) {
  const patch = {}
  if (body.label != null) patch.label = normalizeDocumentLabel(body.label)
  if (body.line_number != null) patch.line_number = parseDocumentLineNumber(body.line_number)
  if (!Object.keys(patch).length) {
    const err = new Error('Nothing to update')
    err.status = 400
    throw err
  }

  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .update(patch)
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .eq('id', documentId)
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, line_number, created_at')
    .single()

  if (error) throw error
  if (!data) {
    const err = new Error('Document not found')
    err.status = 404
    throw err
  }

  return {
    ...data,
    signed_url: await getWarrantyDocumentSignedUrl(data.storage_path),
  }
}

export async function deleteWarrantyDocument(orgId, warrantyId, documentId) {
  const { data: doc, error: readError } = await supabaseAdmin
    .from('warranty_documents')
    .select('id, storage_path')
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .eq('id', documentId)
    .maybeSingle()

  if (readError) throw readError
  if (!doc) {
    const err = new Error('Document not found')
    err.status = 404
    throw err
  }

  const { error } = await supabaseAdmin
    .from('warranty_documents')
    .delete()
    .eq('id', documentId)

  if (error) throw error
  await deleteWarrantyDocumentFile(doc.storage_path)
  return { ok: true }
}

async function deleteAllWarrantyDocuments(orgId, warrantyId) {
  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .select('storage_path')
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)

  if (error) throw error

  const paths = (data || []).map((row) => row.storage_path).filter(Boolean)
  if (paths.length) {
    await supabaseAdmin.storage.from('org-assets').remove(paths)
  }
}

async function loadItems(orgId, warrantyId) {
  const { data, error } = await supabaseAdmin
    .from('warranty_items')
    .select(`
      id, line_number, product_name, model_part_no, value, remarks,
      purchase_date, make, po_number, po_date,
      invoice_number, invoice_date,
      warranty_start, warranty_end,
      warranty_period_months, expiry_notification_days
    `)
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .order('line_number', { ascending: true })

  if (error) throw error
  return data || []
}

async function replaceItems(orgId, warrantyId, items) {
  const { error: deleteError } = await supabaseAdmin
    .from('warranty_items')
    .delete()
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)

  if (deleteError) throw deleteError
  if (!items.length) return []

  const rows = items.map((item) => ({
    org_id: orgId,
    warranty_id: warrantyId,
    ...item,
  }))

  const { data, error } = await supabaseAdmin
    .from('warranty_items')
    .insert(rows)
    .select(`
      id, line_number, product_name, model_part_no, value, remarks,
      purchase_date, make, po_number, po_date,
      invoice_number, invoice_date,
      warranty_start, warranty_end,
      warranty_period_months, expiry_notification_days
    `)

  if (error) throw error
  return data || []
}

function localDateString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addLocalDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

async function warrantyIdsByProductName(orgId, term) {
  const pattern = ilikePattern(term)
  if (!pattern) return []
  const { data, error } = await supabaseAdmin
    .from('warranty_items')
    .select('warranty_id')
    .eq('org_id', orgId)
    .ilike('product_name', pattern)
  if (error) throw error
  return [...new Set((data || []).map((row) => row.warranty_id).filter(Boolean))]
}

async function applyWarrantyFieldFilters(query, orgId, filters = {}) {
  const rest = { ...(filters || {}) }
  if (rest.products) {
    query = restrictToIds(query, 'id', await warrantyIdsByProductName(orgId, rest.products))
    delete rest.products
  }
  return {
    query: applyMappedFilters(query, rest, {
      serial_number: 'serial_number',
      make: 'make',
      vendor: 'vendor',
      po_number: 'po_number',
      invoice_number: 'invoice_number',
      contact_name: 'contact_name',
    }),
  }
}

function applyWarrantyStatusFilter(query, status, expiring = {}) {
  const today = localDateString()
  if (status === 'expired') return query.lt('warranty_end', today)
  if (status === 'active') return query.or(`warranty_end.is.null,warranty_end.gte.${today}`)
  if (status !== 'expiring_soon') return query

  if (expiring.mode === 'dates') {
    const from = String(expiring.dateFrom || '').slice(0, 10)
    const to = String(expiring.dateTo || '').slice(0, 10)
    if (!from || !to) return query.not('warranty_end', 'is', null)
    if (from > to) return query.eq('id', NO_MATCH_ID)
    return query.gte('warranty_end', from).lte('warranty_end', to)
  }

  const minDays = Math.max(0, Number(expiring.minDays) || 0)
  const maxDays = Math.max(minDays, Number(expiring.maxDays) || 0)
  return query.gte('warranty_end', addLocalDays(today, minDays)).lte('warranty_end', addLocalDays(today, maxDays))
}

export async function listWarranties(orgId, {
  search = null,
  limit = 100,
  offset = 0,
  filters = {},
  warrantyStatus = null,
  expiring = {},
} = {}) {
  let query = supabaseAdmin
    .from('warranties')
    .select(WARRANTY_LIST_SELECT, { count: 'exact' })
    .eq('org_id', orgId)

  const term = trimOrNull(search)
  if (term) {
    const q = term.replace(/%/g, '')
    const itemWarrantyIds = await findWarrantyIdsByItemSearch(orgId, term)
    const searchFilters = [
      `serial_number.ilike.%${q}%`,
      `make.ilike.%${q}%`,
      `vendor.ilike.%${q}%`,
      `po_number.ilike.%${q}%`,
      `invoice_number.ilike.%${q}%`,
      `contact_name.ilike.%${q}%`,
      `contact_email.ilike.%${q}%`,
    ]
    if (itemWarrantyIds.length) {
      searchFilters.push(`id.in.(${itemWarrantyIds.join(',')})`)
    }
    query = query.or(searchFilters.join(','))
  }

  query = (await applyWarrantyFieldFilters(query, orgId, filters)).query
  query = applyWarrantyStatusFilter(query, warrantyStatus, expiring)
  query = query.order('serial_number', { ascending: false }).range(offset, offset + limit - 1)

  const [{ data, error, count }, status_counts] = await Promise.all([
    query,
    countWarrantyStatuses(orgId, { search }),
  ])
  if (error) throw error
  const items = await attachFormFieldValueMaps(
    orgId,
    'warranty.warranty',
    (data || []).map(enrichWarrantyRow),
  )
  return listEnvelope(items, { total: count || 0, limit, offset, status_counts })
}

export async function getWarrantyDetail(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('warranties')
    .select(WARRANTY_SELECT)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const items = await loadItems(orgId, id)
  const documents = await loadDocuments(orgId, id)
  return enrichWarrantyRow({ ...data, items, documents })
}

export async function createWarranty(orgId, body) {
  const vendorPayload = await resolveVendorFields(orgId, normalizeWarrantyPayload(body))
  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const items = normalizeItems(body.items, fieldLimits)
  const payload = rollupWarrantyFromItems(items, vendorPayload)
  const serial_number = await nextSerialNumber(orgId)

  const { data, error } = await supabaseAdmin
    .from('warranties')
    .insert({
      org_id: orgId,
      serial_number,
      ...payload,
    })
    .select(WARRANTY_SELECT)
    .single()

  if (error) throw error

  try {
    const savedItems = await replaceItems(orgId, data.id, items)
    return enrichWarrantyRow({ ...data, items: savedItems })
  } catch (itemError) {
    await supabaseAdmin.from('warranties').delete().eq('org_id', orgId).eq('id', data.id)
    throw itemError
  }
}

export async function updateWarranty(orgId, id, body) {
  const vendorPayload = await resolveVendorFields(orgId, normalizeWarrantyPayload(body))
  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const items = normalizeItems(body.items, fieldLimits)
  const payload = rollupWarrantyFromItems(items, vendorPayload)

  const { data, error } = await supabaseAdmin
    .from('warranties')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', id)
    .select(WARRANTY_SELECT)
    .single()

  if (error) throw error

  const savedItems = await replaceItems(orgId, id, items)
  return enrichWarrantyRow({ ...data, items: savedItems })
}

function purchaseKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Existing purchase for vendor + PO number + invoice number. */
export async function findPurchaseWarranty(orgId, { vendorId = null, vendorName = null, poNumber, invoiceNumber } = {}) {
  const po = trimOrNull(poNumber)
  const invoice = trimOrNull(invoiceNumber)
  if (!po || !invoice) return null

  const { data, error } = await supabaseAdmin
    .from('warranties')
    .select('id, serial_number, vendor, vendor_id, po_number, invoice_number, created_at')
    .eq('org_id', orgId)
    .ilike('po_number', escapeLike(po))
    .ilike('invoice_number', escapeLike(invoice))
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) throw error

  const vendorKey = purchaseKey(vendorName)
  return (data || []).find((row) => {
    if (purchaseKey(row.po_number) !== purchaseKey(po)) return false
    if (purchaseKey(row.invoice_number) !== purchaseKey(invoice)) return false
    if (vendorId && row.vendor_id && row.vendor_id === vendorId) return true
    return purchaseKey(row.vendor) === vendorKey
  }) || null
}

/** Add line items without replacing items already stored on the purchase. */
export async function appendWarrantyItems(orgId, warrantyId, extraItems) {
  const existing = await getWarrantyDetail(orgId, warrantyId)
  if (!existing) {
    const err = new Error('Warranty record was not found')
    err.status = 404
    throw err
  }

  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const normalized = normalizeItems(extraItems, fieldLimits)
  if (!normalized.length) return existing

  const maxLine = (existing.items || []).reduce(
    (max, item) => Math.max(max, Number(item.line_number) || 0),
    0,
  )
  const rows = normalized.map((item, index) => ({
    org_id: orgId,
    warranty_id: warrantyId,
    ...item,
    line_number: maxLine + index + 1,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('warranty_items')
    .insert(rows)

  if (insertError) throw insertError

  const items = await loadItems(orgId, warrantyId)
  const payload = rollupWarrantyFromItems(items, {
    vendor_id: existing.vendor_id || null,
    vendor: existing.vendor || null,
    contact_name: existing.contact_name || null,
    contact_phone: existing.contact_phone || null,
    contact_email: existing.contact_email || null,
  })

  const { error: updateError } = await supabaseAdmin
    .from('warranties')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', warrantyId)

  if (updateError) throw updateError
  return getWarrantyDetail(orgId, warrantyId)
}

export async function deleteWarranty(orgId, id) {
  await deleteAllWarrantyDocuments(orgId, id)

  const { error } = await supabaseAdmin
    .from('warranties')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}
