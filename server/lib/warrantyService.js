import { supabaseAdmin } from '../services/supabase.js'
import {
  uploadWarrantyDocumentFile,
  getWarrantyDocumentSignedUrl,
  deleteWarrantyDocumentFile,
} from './warrantyDocumentStorage.js'

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
    id, line_number, product_name, model_part_no, value, remarks
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

function normalizeItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item, index) => ({
      line_number: index + 1,
      product_name: trimOrNull(item.product_name),
      model_part_no: trimOrNull(item.model_part_no),
      value: parseDecimal(item.value),
      remarks: trimOrNull(item.remarks),
    }))
    .filter((item) => (
      item.product_name
      || item.model_part_no
      || item.value != null
      || item.remarks
    ))
}

function normalizeWarrantyPayload(body) {
  return {
    purchase_date: parseDate(body.purchase_date),
    make: trimOrNull(body.make),
    po_number: trimOrNull(body.po_number),
    po_date: parseDate(body.po_date),
    invoice_number: trimOrNull(body.invoice_number),
    invoice_date: parseDate(body.invoice_date),
    warranty_start: parseDate(body.warranty_start),
    warranty_end: parseDate(body.warranty_end),
    warranty_period_months: parseInteger(body.warranty_period_months),
    expiry_notification_days: parseInteger(body.expiry_notification_days),
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
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, created_at')
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
    })
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, created_at')
    .single()

  if (error) throw error

  return {
    ...data,
    signed_url: await getWarrantyDocumentSignedUrl(data.storage_path),
  }
}

export async function updateWarrantyDocumentLabel(orgId, warrantyId, documentId, label) {
  const { data, error } = await supabaseAdmin
    .from('warranty_documents')
    .update({ label: normalizeDocumentLabel(label) })
    .eq('org_id', orgId)
    .eq('warranty_id', warrantyId)
    .eq('id', documentId)
    .select('id, label, file_name, storage_path, file_size, content_type, sort_order, created_at')
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
    .select('id, line_number, product_name, model_part_no, value, remarks')
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
    .select('id, line_number, product_name, model_part_no, value, remarks')

  if (error) throw error
  return data || []
}

export async function listWarranties(orgId, { search = null, limit = 100, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('warranties')
    .select(WARRANTY_LIST_SELECT)
    .eq('org_id', orgId)
    .order('serial_number', { ascending: false })
    .range(offset, offset + limit - 1)

  const term = trimOrNull(search)
  if (term) {
    const q = term.replace(/%/g, '')
    const itemWarrantyIds = await findWarrantyIdsByItemSearch(orgId, term)
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
  return (data || []).map(enrichWarrantyRow)
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
  const payload = await resolveVendorFields(orgId, normalizeWarrantyPayload(body))
  const items = normalizeItems(body.items)
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

  const savedItems = await replaceItems(orgId, data.id, items)
  return enrichWarrantyRow({ ...data, items: savedItems })
}

export async function updateWarranty(orgId, id, body) {
  const payload = await resolveVendorFields(orgId, normalizeWarrantyPayload(body))
  const items = normalizeItems(body.items)

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
