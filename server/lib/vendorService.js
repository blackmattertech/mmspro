import { supabaseAdmin } from '../services/supabase.js'
import { getStateForCity, parseCityName } from './indiaLocations.js'
import { applyIlikeSearch, listEnvelope } from './listQuery.js'

const VENDOR_SELECT = `
  id, org_id, vendor_code, name, contact_person, mobile, email,
  address_line1, address_line2, pincode, city, state,
  gstin, pan, bank_account_number, bank_name, account_name, ifsc_code, branch,
  is_active, created_at, updated_at
`

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeVendorCode(code) {
  const text = trimOrNull(code)
  if (!text) return null
  const match = text.match(/^ven-(\d+)$/i)
  if (match) {
    return `Ven-${match[1].padStart(4, '0')}`
  }
  return text
}

async function nextVendorCode(orgId) {
  const { data, error } = await supabaseAdmin
    .from('vendors')
    .select('vendor_code')
    .eq('org_id', orgId)
    .order('vendor_code', { ascending: false })
    .limit(200)

  if (error) throw error

  let max = 0
  for (const row of data || []) {
    const match = String(row.vendor_code || '').match(/^Ven-(\d+)$/i)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `Ven-${String(max + 1).padStart(4, '0')}`
}

function normalizePayload(body, { isCreate = false } = {}) {
  const city = trimOrNull(parseCityName(body.city))
  const state = trimOrNull(body.state) || (city ? getStateForCity(city) : null)

  return {
    vendor_code: normalizeVendorCode(body.vendor_code),
    name: trimOrNull(body.name),
    contact_person: trimOrNull(body.contact_person),
    mobile: trimOrNull(body.mobile)?.replace(/[\s()-]/g, '') || null,
    email: trimOrNull(body.email),
    address_line1: trimOrNull(body.address_line1),
    address_line2: trimOrNull(body.address_line2),
    pincode: trimOrNull(body.pincode),
    city,
    state,
    gstin: trimOrNull(body.gstin)?.toUpperCase() || null,
    pan: trimOrNull(body.pan)?.toUpperCase() || null,
    bank_account_number: trimOrNull(body.bank_account_number),
    bank_name: trimOrNull(body.bank_name),
    account_name: trimOrNull(body.account_name),
    ifsc_code: trimOrNull(body.ifsc_code)?.toUpperCase() || null,
    branch: trimOrNull(body.branch),
    ...(body.is_active === undefined ? {} : { is_active: Boolean(body.is_active) }),
  }
}

async function assertUniqueCode(orgId, vendorCode, excludeId = null) {
  let query = supabaseAdmin
    .from('vendors')
    .select('id')
    .eq('org_id', orgId)
    .ilike('vendor_code', vendorCode)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (data) {
    const err = new Error('Vendor ID already exists')
    err.status = 400
    throw err
  }
}

export async function listVendors(orgId, { search = null, limit = 100, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('vendors')
    .select(VENDOR_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .order('vendor_code', { ascending: true })
    .range(offset, offset + limit - 1)

  query = applyIlikeSearch(query, search, [
    'vendor_code', 'name', 'contact_person', 'mobile', 'email', 'city', 'gstin',
  ])

  const { data, error, count } = await query
  if (error) throw error
  return listEnvelope(data || [], { total: count || 0, limit, offset })
}

export async function getVendorDetail(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('vendors')
    .select(VENDOR_SELECT)
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createVendor(orgId, body) {
  const payload = normalizePayload(body, { isCreate: true })
  if (!payload.vendor_code) {
    payload.vendor_code = await nextVendorCode(orgId)
  }

  const errors = validateVendorFields(payload, { requireName: true })
  const validationError = firstVendorValidationError(errors)
  if (validationError) {
    const err = new Error(validationError)
    err.status = 400
    throw err
  }

  await assertUniqueCode(orgId, payload.vendor_code)

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .insert({ org_id: orgId, ...payload })
    .select(VENDOR_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateVendor(orgId, id, body) {
  const payload = normalizePayload(body)
  if (!payload.vendor_code) {
    const err = new Error('Vendor ID is required')
    err.status = 400
    throw err
  }

  const errors = validateVendorFields(payload, { requireName: true, requireCode: true })
  const validationError = firstVendorValidationError(errors)
  if (validationError) {
    const err = new Error(validationError)
    err.status = 400
    throw err
  }

  await assertUniqueCode(orgId, payload.vendor_code, id)

  const { data, error } = await supabaseAdmin
    .from('vendors')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('id', id)
    .select(VENDOR_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function deleteVendor(orgId, id) {
  const { error } = await supabaseAdmin
    .from('vendors')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function previewNextVendorCode(orgId) {
  return nextVendorCode(orgId)
}
