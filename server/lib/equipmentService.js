import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { getSignedUrl } from './signedUrlCache.js'
import { applyIlikeSearch, ilikePattern, listEnvelope } from './listQuery.js'
import { getPublicAppUrl } from './appUrl.js'
import { parseLayoutId } from './formLayoutIds.js'
import { loadRuntimeFormLayout } from './orgFormLayouts.js'
import {
  uploadEquipmentImageFile,
  deleteEquipmentImageFile,
} from './equipmentImageStorage.js'
import { normalizeMasterName } from './bulkMasterMatch.js'

const ORG_ASSETS_BUCKET = 'org-assets'

const EQUIPMENT_SELECT = `
  id, org_id, location_id, department_id, area_id,
  name, code, qr_code, image_path, is_active, reading_required,
  last_meter_reading, last_meter_reading_at, last_meter_logged_by_name,
  last_meter_logged_by_department, last_meter_logged_by_designation,
  created_at, updated_at,
  org_locations(id, name, code),
  departments(id, name),
  areas(id, name, code)
`

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

/** Active parent fields ordered by section, then field sort order. */
function orderedParentFields(fields) {
  const sections = (fields || [])
    .filter((f) => f.kind === 'section' && f.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  const parents = (fields || []).filter((f) => f.kind === 'parent' && f.is_active !== false)

  const ordered = []
  for (const section of sections) {
    parents
      .filter((p) => p.section_id === section.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .forEach((p) => ordered.push(p))
  }
  // Include any parents whose section is missing/inactive so nothing is lost.
  const seen = new Set(ordered.map((p) => p.id))
  parents
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .forEach((p) => ordered.push(p))
  return ordered
}

function isCodeField(field) {
  return /(^|[^a-z])code([^a-z]|$)/i.test(String(field.name || ''))
}

function isNameField(field) {
  return /(^|[^a-z])name([^a-z]|$)/i.test(String(field.name || ''))
}

function isAreaField(field) {
  return normalizeMasterName(field?.name) === 'area'
}

function areaNameFromValues(fields, valuesInput) {
  const areaField = orderedParentFields(fields).find(isAreaField)
  if (!areaField) return ''
  const item = (valuesInput || []).find((row) => row?.field_id === areaField.id)
  const text = valueTextOf(item)
  const head = text.split(/\s*[—–]\s*/)[0].trim()
  return head || text
}

async function ensureEquipmentArea(orgId, { name, locationId, departmentId }) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return null

  let query = supabaseAdmin
    .from('areas')
    .select('id, name, code, location_id, department_id, is_active')
    .eq('org_id', orgId)
    .ilike('name', trimmed.replace(/[%_\\]/g, (ch) => `\\${ch}`))
  query = locationId ? query.eq('location_id', locationId) : query.is('location_id', null)
  query = departmentId ? query.eq('department_id', departmentId) : query.is('department_id', null)

  const { data: existing, error: findError } = await query.limit(1).maybeSingle()
  if (findError) throw findError
  if (existing) return existing

  const { data, error } = await supabaseAdmin
    .from('areas')
    .insert({
      org_id: orgId,
      location_id: locationId || null,
      department_id: departmentId || null,
      name: trimmed,
      is_active: true,
    })
    .select('id, name, code, location_id, department_id, is_active')
    .single()
  if (error) throw error
  return data
}

/** The equipment master Area field is the area record shown on the Areas tab. */
async function applyEquipmentArea(orgId, equipmentId, fields, valuesInput, placement = {}) {
  if (!orderedParentFields(fields).some(isAreaField)) return null
  const name = areaNameFromValues(fields, valuesInput)
  const locationId = placement.locationId || null
  const departmentId = placement.departmentId || null
  if (!name) {
    await supabaseAdmin
      .from('equipment')
      .update({ area_id: null })
      .eq('id', equipmentId)
      .eq('org_id', orgId)
    return null
  }
  const area = await ensureEquipmentArea(orgId, { name, locationId, departmentId })
  const { error } = await supabaseAdmin
    .from('equipment')
    .update({ area_id: area.id })
    .eq('id', equipmentId)
    .eq('org_id', orgId)
  if (error) throw error
  return area
}

/**
 * Derive the fixed name/code columns from the dynamic field values.
 * The Super Admin defines an "equipment code" field which drives uniqueness;
 * the first configured field (or a "name" field) is used as the display label.
 */
function deriveEquipmentIdentity(fields, valuesInput) {
  const parents = orderedParentFields(fields)
  const valueByField = new Map()
  for (const item of valuesInput || []) {
    if (!item?.field_id) continue
    const raw = Array.isArray(item.value_json?.values)
      ? item.value_json.values.join(', ')
      : (item.value_text ?? '')
    valueByField.set(item.field_id, String(raw ?? '').trim())
  }

  const codeField = parents.find(isCodeField) || null
  const nameField = parents.find(isNameField)
    || parents.find((p) => !codeField || p.id !== codeField.id)
    || codeField

  const codeValue = codeField ? valueByField.get(codeField.id) || '' : ''
  const nameValue = nameField ? valueByField.get(nameField.id) || '' : ''

  return {
    codeField,
    nameField,
    code: codeValue ? normalizeCode(codeValue) : null,
    name: nameValue || codeValue || null,
  }
}

/**
 * Prefer Name and Code sent by the equipment form.
 * Older clients omit them, and those records still take identity from catalog fields.
 */
function resolveEquipmentIdentity(fields, body) {
  const derived = deriveEquipmentIdentity(fields, body.values)
  const explicitName = typeof body.name === 'string' ? body.name.trim() : ''
  const explicitCode = typeof body.code === 'string' ? normalizeCode(body.code) : ''
  const name = explicitName || derived.name || 'Equipment'
  const code = explicitCode || derived.code || `EQ-${randomUUID().slice(0, 8).toUpperCase()}`
  return { name, code }
}

function valueTextOf(item) {
  if (!item) return ''
  if (Array.isArray(item.value_json?.values)) {
    return item.value_json.values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  return String(item.value_text ?? '').trim()
}

async function qrCodeForEquipment(orgId, equipmentId, valuesInput) {
  const layout = await loadRuntimeFormLayout(orgId, 'equipment.create')
  const parsed = parseLayoutId(layout?.qrFieldId)
  if (parsed.kind === 'catalog' && Array.isArray(valuesInput)) {
    const item = valuesInput.find((row) => row.field_id === parsed.value)
    const text = valueTextOf(item)
    if (text) return text
  }
  const slug = await orgSlugFor(orgId)
  if (!slug) return null
  return equipmentScanUrl(slug, equipmentId)
}

const EQUIPMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function equipmentScanUrl(orgSlug, equipmentId) {
  return `${getPublicAppUrl()}/${orgSlug}/scan/equipment/${equipmentId}`
}

async function orgSlugFor(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  return data?.slug || null
}

async function writeEquipmentQr(orgId, equipmentId, valuesInput) {
  const qrCode = await qrCodeForEquipment(orgId, equipmentId, valuesInput)
  if (!qrCode) return null
  const { error } = await supabaseAdmin
    .from('equipment')
    .update({ qr_code: qrCode })
    .eq('id', equipmentId)
    .eq('org_id', orgId)
  if (error) {
    if (error.code === '23505') throw new Error('That QR value is already used by another equipment record')
    throw error
  }
  return qrCode
}

async function attachImageUrl(row) {
  if (!row?.image_path) return row
  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, row.image_path)
  if (!signedUrl) return row
  return { ...row, image_signed_url: signedUrl }
}

async function assertOrgLocation(orgId, locationId) {
  if (!locationId) return
  const { data: location } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!location) throw new Error('Invalid location')
}

async function assertOrgDepartment(orgId, departmentId) {
  if (!departmentId) return
  const { data: department } = await supabaseAdmin
    .from('departments')
    .select('id')
    .eq('id', departmentId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!department) throw new Error('Invalid department')
}

async function assertPlacement(orgId, { location_id, department_id, area_id }) {
  await assertOrgLocation(orgId, location_id)

  const { data: department } = await supabaseAdmin
    .from('departments')
    .select('id, location_id, all_locations')
    .eq('id', department_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!department) throw new Error('Invalid department')
  if (!department.all_locations && department.location_id && department.location_id !== location_id) {
    throw new Error('Department does not belong to the selected location')
  }

  const { data: area } = await supabaseAdmin
    .from('areas')
    .select('id, location_id, department_id')
    .eq('id', area_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!area) throw new Error('Invalid area')
  if (area.location_id !== location_id || area.department_id !== department_id) {
    throw new Error('Area does not belong to the selected location and department')
  }
}

const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000'

async function idsMatchingName(table, orgId, value) {
  const pattern = ilikePattern(value)
  if (!pattern) return null
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('org_id', orgId)
    .ilike('name', pattern)
  if (error) throw error
  return (data || []).map((row) => row.id)
}

function restrictToIds(query, column, ids) {
  return query.in(column, ids?.length ? ids : [NO_MATCH_ID])
}

function applyEquipmentStatusFilter(query, value) {
  const term = String(value || '').trim().toLowerCase()
  if (!term) return query
  const matchActive = 'active'.includes(term)
  const matchInactive = 'inactive'.includes(term)
  if (matchActive && matchInactive) return query
  if (matchActive) return query.eq('is_active', true)
  if (matchInactive) return query.eq('is_active', false)
  return query.eq('id', NO_MATCH_ID)
}

function applyEquipmentSort(query, sortBy) {
  switch (sortBy) {
    case 'oldest':
      return query.order('created_at', { ascending: true })
    case 'newest':
      return query.order('created_at', { ascending: false })
    case 'name_desc':
      return query.order('name', { ascending: false })
    case 'name_asc':
    default:
      return query.order('name', { ascending: true })
  }
}

export async function listEquipment(orgId, {
  locationId,
  departmentId,
  areaId,
  search,
  filters = {},
  sortBy = 'name_asc',
  limit = 50,
  offset = 0,
  includeImages = false,
} = {}) {
  let query = supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_SELECT, { count: 'exact' })
    .eq('org_id', orgId)

  if (locationId) query = query.eq('location_id', locationId)
  if (departmentId) query = query.eq('department_id', departmentId)
  if (areaId) query = query.eq('area_id', areaId)
  query = applyIlikeSearch(query, search, ['name', 'code', 'qr_code'])

  const namePattern = ilikePattern(filters.name)
  if (namePattern) query = query.ilike('name', namePattern)
  const codePattern = ilikePattern(filters.code)
  if (codePattern) query = query.ilike('code', codePattern)
  if (filters.location) {
    query = restrictToIds(query, 'location_id', await idsMatchingName('org_locations', orgId, filters.location))
  }
  if (filters.department) {
    query = restrictToIds(query, 'department_id', await idsMatchingName('departments', orgId, filters.department))
  }
  if (filters.area) {
    query = restrictToIds(query, 'area_id', await idsMatchingName('areas', orgId, filters.area))
  }
  query = applyEquipmentStatusFilter(query, filters.status)
  query = applyEquipmentSort(query, sortBy).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  const rows = await Promise.all((data || []).map((row) => attachImageUrl(row)))
  if (includeImages || rows.length) await attachImageFieldValues(orgId, rows)
  return listEnvelope(rows, { total: count || 0, limit, offset })
}

async function displayImageValue(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(https?:|data:image\/)/i.test(text)) return text
  return (await getSignedUrl(ORG_ASSETS_BUCKET, text)) || text
}

async function attachImageFieldValues(orgId, rows) {
  if (!rows.length) return
  const fields = await loadOrgFields(orgId)
  const imageFields = fields.filter((field) => (
    field.kind === 'parent'
    && field.is_active !== false
    && (field.field_type === 'image' || field.field_type === 'file' || /image/i.test(field.name || ''))
  ))
  if (!imageFields.length) return
  const ids = imageFields.map((field) => field.id)
  const { data, error } = await supabaseAdmin
    .from('equipment_values')
    .select('equipment_id, field_id, value_text, value_json')
    .eq('org_id', orgId)
    .in('equipment_id', rows.map((row) => row.id))
    .in('field_id', ids)
  if (error) throw error
  const byEquipment = new Map()
  for (const item of data || []) {
    const list = byEquipment.get(item.equipment_id) || []
    list.push({
      ...item,
      value_text: await displayImageValue(item.value_text),
    })
    byEquipment.set(item.equipment_id, list)
  }
  for (const row of rows) {
    row.field_values = byEquipment.get(row.id) || row.field_values || []
  }
}

export async function getEquipmentById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function loadEquipmentValues(orgId, equipmentId) {
  const { data, error } = await supabaseAdmin
    .from('equipment_values')
    .select('id, field_id, value_text, value_json')
    .eq('org_id', orgId)
    .eq('equipment_id', equipmentId)

  if (error) throw error
  return data || []
}

const CLOSED_WORK_ORDER_STATUSES = new Set(['completed', 'verified', 'closed'])

function emptyEquipmentActivity() {
  return {
    workOrders: { total: 0, open: 0, closed: 0 },
    pm: { total: 0, upcoming: 0, overdue: 0 },
    inspection: { lastAt: null, nextDue: null },
    warranty: { status: 'none', expiresOn: null },
  }
}

async function loadEquipmentActivity(orgId, equipment) {
  const activity = emptyEquipmentActivity()
  const today = new Date().toISOString().slice(0, 10)
  const [ordersResult, plansResult, warrantyResult] = await Promise.all([
    supabaseAdmin
      .from('manual_work_orders')
      .select('status, closed_at, updated_at')
      .eq('org_id', orgId)
      .eq('equipment_id', equipment.id),
    supabaseAdmin
      .from('pm_plans')
      .select('status, next_due_at')
      .eq('org_id', orgId)
      .eq('equipment_id', equipment.id),
    equipment.code
      ? supabaseAdmin
        .from('warranties')
        .select('warranty_end')
        .eq('org_id', orgId)
        .ilike('serial_number', String(equipment.code).replace(/[%_\\]/g, (ch) => `\\${ch}`))
        .limit(1)
      : Promise.resolve({ data: [] }),
  ])

  if (!ordersResult.error) {
    const orders = ordersResult.data || []
    const closed = orders.filter((order) => CLOSED_WORK_ORDER_STATUSES.has(order.status))
    activity.workOrders = {
      total: orders.length,
      open: orders.length - closed.length,
      closed: closed.length,
    }
    const lastAt = closed
      .map((order) => order.closed_at || order.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null
    activity.inspection.lastAt = lastAt
  }

  if (!plansResult.error) {
    const plans = plansResult.data || []
    const active = plans.filter((plan) => plan.status === 'active' && plan.next_due_at)
    const upcoming = active.filter((plan) => plan.next_due_at >= today)
    const overdue = active.filter((plan) => plan.next_due_at < today)
    activity.pm = {
      total: plans.length,
      upcoming: upcoming.length,
      overdue: overdue.length,
    }
    activity.inspection.nextDue = active.map((plan) => plan.next_due_at).sort()[0] || null
  }

  if (!warrantyResult.error) {
    const expiresOn = warrantyResult.data?.[0]?.warranty_end || null
    activity.warranty = {
      status: !expiresOn ? 'none' : (expiresOn >= today ? 'active' : 'expired'),
      expiresOn,
    }
  }

  return activity
}

export async function getEquipmentDetail(orgId, id) {
  const equipment = await getEquipmentById(orgId, id)
  if (!equipment) return null

  const [values, fields, activity] = await Promise.all([
    loadEquipmentValues(orgId, id),
    loadOrgFields(orgId),
    loadEquipmentActivity(orgId, equipment).catch(() => emptyEquipmentActivity()),
  ])

  const valueByField = new Map(values.map((row) => [row.field_id, row]))
  const fieldValues = fields
    .filter((f) => f.kind === 'parent' && f.is_active !== false)
    .map((field) => {
      const row = valueByField.get(field.id)
      return {
        field_id: field.id,
        field_name: field.name,
        field_type: field.field_type,
        section_id: field.section_id,
        section_name: field.section_name,
        value_text: row?.value_text ?? null,
        value_json: row?.value_json ?? null,
        dropdown_options: field.dropdown_options,
      }
    })

  let withImage = await attachImageUrl(equipment)
  if (!withImage.qr_code) {
    const qrCode = await writeEquipmentQr(orgId, id)
    if (qrCode) withImage = { ...withImage, qr_code: qrCode }
  }
  return { ...withImage, field_values: fieldValues, values, activity }
}

async function syncEquipmentValues(orgId, equipmentId, valuesInput) {
  if (!Array.isArray(valuesInput)) return

  const fields = await loadOrgFields(orgId)
  const parents = new Map(
    fields.filter((f) => f.kind === 'parent').map((f) => [f.id, f]),
  )

  for (const item of valuesInput) {
    if (!item.field_id || !parents.has(item.field_id)) {
      throw new Error('Invalid equipment field')
    }
  }

  const validItems = valuesInput
  if (!validItems.length) return

  const fieldIds = validItems.map((item) => item.field_id)
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('equipment_values')
    .select('id, field_id')
    .eq('equipment_id', equipmentId)
    .in('field_id', fieldIds)

  if (existingError) throw existingError

  const existingByField = new Map((existingRows || []).map((row) => [row.field_id, row.id]))
  const now = new Date().toISOString()
  const inserts = []
  const updates = []

  for (const item of validItems) {
    const fieldId = item.field_id
    const valueText = item.value_text !== undefined
      ? (item.value_text == null ? null : String(item.value_text))
      : undefined
    const valueJson = item.value_json !== undefined ? item.value_json : undefined

    const existingId = existingByField.get(fieldId)
    if (existingId) {
      const updatesPayload = { updated_at: now }
      if (valueText !== undefined) updatesPayload.value_text = valueText
      if (valueJson !== undefined) updatesPayload.value_json = valueJson
      updates.push({ id: existingId, payload: updatesPayload })
    } else {
      inserts.push({
        org_id: orgId,
        equipment_id: equipmentId,
        field_id: fieldId,
        updated_at: now,
        value_text: valueText ?? null,
        value_json: valueJson ?? null,
      })
    }
  }

  if (updates.length) {
    await Promise.all(updates.map(({ id, payload }) => supabaseAdmin
      .from('equipment_values')
      .update(payload)
      .eq('id', id)))
  }

  if (inserts.length) {
    const { error: insertError } = await supabaseAdmin
      .from('equipment_values')
      .insert(inserts)
    if (insertError) throw insertError
  }
}

export async function createEquipment(orgId, body, { fields: preloadedFields = null, skipDetail = false } = {}) {
  const fields = preloadedFields || await loadOrgFields(orgId)
  const identity = resolveEquipmentIdentity(fields, body)

  if (body.location_id && body.department_id && body.area_id) {
    await assertPlacement(orgId, {
      location_id: body.location_id,
      department_id: body.department_id,
      area_id: body.area_id,
    })
  }

  const { data, error } = await supabaseAdmin
    .from('equipment')
    .insert({
      org_id: orgId,
      location_id: body.location_id || null,
      department_id: body.department_id || null,
      area_id: body.area_id || null,
      name: identity.name,
      code: identity.code,
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      reading_required: body.reading_required === true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Equipment code or QR code already exists')
    }
    throw error
  }

  if (body.values?.length) {
    await syncEquipmentValues(orgId, data.id, body.values)
  }
  await applyEquipmentArea(orgId, data.id, fields, body.values, {
    locationId: body.location_id,
    departmentId: body.department_id,
  })

  if (body.image?.data) {
    const imagePath = await uploadEquipmentImageFile(orgId, data.id, body.image)
    await supabaseAdmin
      .from('equipment')
      .update({ image_path: imagePath, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('org_id', orgId)
  }

  await writeEquipmentQr(orgId, data.id, body.values)

  if (skipDetail) return { id: data.id }
  return getEquipmentDetail(orgId, data.id)
}

export async function updateEquipment(orgId, id, body) {
  const existing = await getEquipmentById(orgId, id)
  if (!existing) {
    throw Object.assign(new Error('Equipment not found'), { status: 404 })
  }

  const updates = { updated_at: new Date().toISOString() }

  if (body.values !== undefined || body.name !== undefined || body.code !== undefined) {
    const fields = await loadOrgFields(orgId)
    const identity = resolveEquipmentIdentity(fields, body)
    updates.name = identity.name
    updates.code = identity.code
  }
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
  if (body.reading_required !== undefined) updates.reading_required = body.reading_required === true

  const locationId = body.location_id ?? existing.location_id
  const departmentId = body.department_id ?? existing.department_id
  const areaId = body.area_id ?? existing.area_id

  if (
    body.location_id !== undefined
    || body.department_id !== undefined
    || body.area_id !== undefined
  ) {
    if (body.area_id !== undefined) {
      await assertPlacement(orgId, {
        location_id: locationId,
        department_id: departmentId,
        area_id: areaId,
      })
      updates.area_id = areaId
    } else {
      if (body.location_id !== undefined) await assertOrgLocation(orgId, locationId)
      if (body.department_id !== undefined) await assertOrgDepartment(orgId, departmentId)
    }
    if (body.location_id !== undefined) updates.location_id = locationId
    if (body.department_id !== undefined) updates.department_id = departmentId
  }

  if (body.remove_image === true && existing.image_path) {
    await deleteEquipmentImageFile(existing.image_path).catch(() => {})
    updates.image_path = null
  }
  if (body.image?.data) {
    updates.image_path = await uploadEquipmentImageFile(orgId, id, body.image)
  }

  const { error } = await supabaseAdmin
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23505') {
      throw new Error('Equipment code or QR code already exists')
    }
    throw error
  }

  if (body.values !== undefined) {
    const fields = await loadOrgFields(orgId)
    await syncEquipmentValues(orgId, id, body.values)
    await applyEquipmentArea(orgId, id, fields, body.values, {
      locationId: body.location_id !== undefined ? body.location_id : existing.location_id,
      departmentId: body.department_id !== undefined ? body.department_id : existing.department_id,
    })
    await writeEquipmentQr(orgId, id, body.values)
  }

  return getEquipmentDetail(orgId, id)
}

export async function findEquipmentByScan(orgId, raw) {
  const text = String(raw || '').trim()
  if (!text) return null

  const fromUrl = text.match(/\/scan\/equipment\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  const id = fromUrl?.[1] || (EQUIPMENT_ID_RE.test(text) ? text : null)
  if (id) {
    const row = await getEquipmentById(orgId, id)
    if (row) return row
  }

  const { data, error } = await supabaseAdmin
    .from('equipment')
    .select('id')
    .eq('org_id', orgId)
    .eq('qr_code', text)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  return getEquipmentById(orgId, data.id)
}

export async function deleteEquipment(orgId, id) {
  const existing = await getEquipmentById(orgId, id)
  if (!existing) {
    throw Object.assign(new Error('Equipment not found'), { status: 404 })
  }

  const { error } = await supabaseAdmin
    .from('equipment')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      throw Object.assign(new Error('This equipment is linked to other records and cannot be deleted.'), { status: 409 })
    }
    throw error
  }
  if (existing.image_path) {
    await deleteEquipmentImageFile(existing.image_path).catch(() => {})
  }
  return { id, deleted: true }
}

export { orderedParentFields, deriveEquipmentIdentity }
