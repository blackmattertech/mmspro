import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { getSignedUrl } from './signedUrlCache.js'
import {
  uploadEquipmentImageFile,
  deleteEquipmentImageFile,
} from './equipmentImageStorage.js'

const ORG_ASSETS_BUCKET = 'org-assets'

const EQUIPMENT_SELECT = `
  id, org_id, location_id, department_id, area_id,
  name, code, qr_code, image_path, is_active, created_at, updated_at,
  org_locations(id, name, code),
  departments(id, name, code),
  areas(id, name, code)
`

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

function normalizeQr(qr) {
  const value = String(qr || '').trim()
  return value || null
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

async function attachImageUrl(row) {
  if (!row?.image_path) return row
  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, row.image_path)
  if (!signedUrl) return row
  return { ...row, image_signed_url: signedUrl }
}

async function assertPlacement(orgId, { location_id, department_id, area_id }) {
  const { data: location } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('id', location_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!location) throw new Error('Invalid location')

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

export async function listEquipment(orgId, {
  locationId,
  departmentId,
  areaId,
  search,
  limit = 50,
  offset = 0,
} = {}) {
  let query = supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .eq('org_id', orgId)
    .order('name')
    .range(offset, offset + limit - 1)

  if (locationId) query = query.eq('location_id', locationId)
  if (departmentId) query = query.eq('department_id', departmentId)
  if (areaId) query = query.eq('area_id', areaId)
  if (search?.trim()) {
    const q = search.trim().replace(/%/g, '')
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,qr_code.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return Promise.all((data || []).map((row) => attachImageUrl(row)))
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

export async function getEquipmentDetail(orgId, id) {
  const equipment = await getEquipmentById(orgId, id)
  if (!equipment) return null

  const [values, fields] = await Promise.all([
    loadEquipmentValues(orgId, id),
    loadOrgFields(orgId),
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

  const withImage = await attachImageUrl(equipment)
  return { ...withImage, field_values: fieldValues, values }
}

async function syncEquipmentValues(orgId, equipmentId, valuesInput) {
  if (!Array.isArray(valuesInput)) return

  const fields = await loadOrgFields(orgId)
  const parents = new Map(
    fields.filter((f) => f.kind === 'parent').map((f) => [f.id, f]),
  )

  for (const item of valuesInput) {
    const fieldId = item.field_id
    if (!fieldId || !parents.has(fieldId)) {
      throw new Error('Invalid equipment field')
    }

    const valueText = item.value_text !== undefined
      ? (item.value_text == null ? null : String(item.value_text))
      : undefined
    const valueJson = item.value_json !== undefined ? item.value_json : undefined

    const payload = {
      org_id: orgId,
      equipment_id: equipmentId,
      field_id: fieldId,
      updated_at: new Date().toISOString(),
    }
    if (valueText !== undefined) payload.value_text = valueText
    if (valueJson !== undefined) payload.value_json = valueJson

    const { data: existing } = await supabaseAdmin
      .from('equipment_values')
      .select('id')
      .eq('equipment_id', equipmentId)
      .eq('field_id', fieldId)
      .maybeSingle()

    if (existing) {
      const updates = { updated_at: payload.updated_at }
      if (valueText !== undefined) updates.value_text = valueText
      if (valueJson !== undefined) updates.value_json = valueJson
      const { error } = await supabaseAdmin
        .from('equipment_values')
        .update(updates)
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabaseAdmin
        .from('equipment_values')
        .insert({
          ...payload,
          value_text: valueText ?? null,
          value_json: valueJson ?? null,
        })
      if (error) throw error
    }
  }
}

export async function createEquipment(orgId, body) {
  if (!body.location_id) throw new Error('Location is required')
  if (!body.department_id) throw new Error('Department is required')
  if (!body.area_id) throw new Error('Area is required')

  const fields = await loadOrgFields(orgId)
  const identity = deriveEquipmentIdentity(fields, body.values)
  if (identity.codeField && !identity.code) {
    throw new Error(`${identity.codeField.name} is required`)
  }

  await assertPlacement(orgId, {
    location_id: body.location_id,
    department_id: body.department_id,
    area_id: body.area_id,
  })

  const qrCode = normalizeQr(body.qr_code)

  const { data, error } = await supabaseAdmin
    .from('equipment')
    .insert({
      org_id: orgId,
      location_id: body.location_id,
      department_id: body.department_id,
      area_id: body.area_id,
      name: identity.name,
      code: identity.code,
      qr_code: qrCode,
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
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

  if (body.image?.data) {
    const imagePath = await uploadEquipmentImageFile(orgId, data.id, body.image)
    await supabaseAdmin
      .from('equipment')
      .update({ image_path: imagePath, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('org_id', orgId)
  }

  return getEquipmentDetail(orgId, data.id)
}

export async function updateEquipment(orgId, id, body) {
  const existing = await getEquipmentById(orgId, id)
  if (!existing) {
    throw Object.assign(new Error('Equipment not found'), { status: 404 })
  }

  const updates = { updated_at: new Date().toISOString() }

  if (body.values !== undefined) {
    const fields = await loadOrgFields(orgId)
    const identity = deriveEquipmentIdentity(fields, body.values)
    if (identity.codeField && !identity.code) {
      throw new Error(`${identity.codeField.name} is required`)
    }
    updates.name = identity.name
    updates.code = identity.code
  }
  if (body.qr_code !== undefined) updates.qr_code = normalizeQr(body.qr_code)
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)

  const locationId = body.location_id ?? existing.location_id
  const departmentId = body.department_id ?? existing.department_id
  const areaId = body.area_id ?? existing.area_id

  if (
    body.location_id !== undefined
    || body.department_id !== undefined
    || body.area_id !== undefined
  ) {
    await assertPlacement(orgId, {
      location_id: locationId,
      department_id: departmentId,
      area_id: areaId,
    })
    updates.location_id = locationId
    updates.department_id = departmentId
    updates.area_id = areaId
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
    await syncEquipmentValues(orgId, id, body.values)
  }

  return getEquipmentDetail(orgId, id)
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

  if (error) throw error
  if (existing.image_path) {
    await deleteEquipmentImageFile(existing.image_path).catch(() => {})
  }
  return { id, deleted: true }
}

export { orderedParentFields, deriveEquipmentIdentity }
