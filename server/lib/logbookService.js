import { supabaseAdmin } from '../services/supabase.js'
import { applyIlikeSearch, listEnvelope } from './listQuery.js'

const EQUIPMENT_LIST_SELECT = `
  id, name, code, location_id, department_id, area_id, is_active, reading_required,
  last_meter_reading, last_meter_reading_at, last_meter_logged_by_name,
  last_meter_logged_by_department, last_meter_logged_by_designation,
  org_locations(id, name),
  departments(id, name),
  areas(id, name)
`

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function asReading(value) {
  if (value == null || value === '') return null
  const reading = Number(value)
  return Number.isFinite(reading) ? reading : null
}

function mapEquipment(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    location_id: row.location_id,
    department_id: row.department_id,
    area_id: row.area_id,
    is_active: row.is_active !== false,
    reading_required: row.reading_required === true,
    location_name: row.org_locations?.name || null,
    department_name: row.departments?.name || null,
    area_name: row.areas?.name || null,
    last_reading: asReading(row.last_meter_reading),
    last_reading_at: row.last_meter_reading_at || null,
    logged_by_name: row.last_meter_logged_by_name || null,
    logged_by_department: row.last_meter_logged_by_department || null,
    logged_by_designation: row.last_meter_logged_by_designation || null,
  }
}

function mapReading(row) {
  return {
    id: row.id,
    equipment_id: row.equipment_id,
    reading: asReading(row.reading),
    reading_at: row.reading_at,
    logged_by: row.logged_by || null,
    logged_by_name: row.logged_by_name || 'Unknown user',
    logged_by_department: row.logged_by_department || null,
    logged_by_designation: row.logged_by_designation || null,
    created_at: row.created_at,
  }
}

async function getEquipmentRow(orgId, equipmentId) {
  const { data, error } = await supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_LIST_SELECT)
    .eq('org_id', orgId)
    .eq('id', equipmentId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Equipment not found', 404)
  return data
}

async function readerContext(orgId, userId) {
  if (!userId) return { name: 'Unknown user', department: null, designation: null }
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  const name = String(profile?.full_name || '').trim() || profile?.email || 'Unknown user'

  let employeeQuery = supabaseAdmin
    .from('org_employees')
    .select('department_id, access_role_id')
    .eq('org_id', orgId)
    .eq('profile_id', userId)
    .maybeSingle()
  let { data: employee, error: employeeError } = await employeeQuery
  if (employeeError) throw employeeError
  if (!employee && profile?.email) {
    const byEmail = await supabaseAdmin
      .from('org_employees')
      .select('department_id, access_role_id')
      .eq('org_id', orgId)
      .ilike('email', profile.email)
      .maybeSingle()
    if (byEmail.error) throw byEmail.error
    employee = byEmail.data
  }
  if (!employee && name && name !== 'Unknown user') {
    const byName = await supabaseAdmin
      .from('org_employees')
      .select('department_id, access_role_id')
      .eq('org_id', orgId)
      .ilike('name', name)
    if (byName.error) throw byName.error
    if (byName.data?.length === 1) employee = byName.data[0]
  }

  const [departmentResult, roleResult] = await Promise.all([
    employee?.department_id
      ? supabaseAdmin.from('departments').select('name').eq('id', employee.department_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    employee?.access_role_id
      ? supabaseAdmin.from('org_access_roles').select('name').eq('id', employee.access_role_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (departmentResult.error) throw departmentResult.error
  if (roleResult.error) throw roleResult.error

  return {
    name,
    department: departmentResult.data?.name || null,
    designation: roleResult.data?.name || null,
  }
}

async function refreshLatest(orgId, equipmentId) {
  const { data, error } = await supabaseAdmin
    .from('equipment_meter_readings')
    .select('reading, reading_at, logged_by_name, logged_by_department, logged_by_designation')
    .eq('org_id', orgId)
    .eq('equipment_id', equipmentId)
    .order('reading_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const { error: updateError } = await supabaseAdmin
    .from('equipment')
    .update({
      last_meter_reading: data?.reading ?? null,
      last_meter_reading_at: data?.reading_at ?? null,
      last_meter_logged_by_name: data?.logged_by_name ?? null,
      last_meter_logged_by_department: data?.logged_by_department ?? null,
      last_meter_logged_by_designation: data?.logged_by_designation ?? null,
    })
    .eq('id', equipmentId)
    .eq('org_id', orgId)
  if (updateError) throw updateError
  return data || null
}

export async function listLogbookEquipment(orgId, {
  locationId = null,
  search = null,
  limit = 50,
  offset = 0,
} = {}) {
  let query = supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_LIST_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('reading_required', true)

  if (locationId) query = query.eq('location_id', locationId)
  query = applyIlikeSearch(query, search, ['name', 'code'])
  query = query.order('name', { ascending: true }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  return listEnvelope((data || []).map(mapEquipment), { total: count || 0, limit, offset })
}

export async function getLatestMeterReading(orgId, equipmentId) {
  const equipment = mapEquipment(await getEquipmentRow(orgId, equipmentId))
  return {
    equipment_id: equipment.id,
    equipment_name: equipment.name,
    equipment_code: equipment.code,
    location_id: equipment.location_id,
    reading_required: equipment.reading_required,
    reading: equipment.last_reading,
    reading_at: equipment.last_reading_at,
    logged_by_name: equipment.logged_by_name,
    logged_by_department: equipment.logged_by_department,
    logged_by_designation: equipment.logged_by_designation,
  }
}

export async function listMeterReadings(orgId, equipmentId) {
  const equipment = mapEquipment(await getEquipmentRow(orgId, equipmentId))
  const { data, error } = await supabaseAdmin
    .from('equipment_meter_readings')
    .select('id, equipment_id, reading, reading_at, logged_by, logged_by_name, logged_by_department, logged_by_designation, created_at')
    .eq('org_id', orgId)
    .eq('equipment_id', equipmentId)
    .order('reading_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return {
    equipment,
    readings: (data || []).map(mapReading),
  }
}

export async function addMeterReading(orgId, equipmentId, body, userId) {
  const equipment = await getEquipmentRow(orgId, equipmentId)
  if (equipment.reading_required !== true) {
    throw httpError('Turn on Reading required for this equipment before logging a meter reading.')
  }

  const reading = asReading(body?.reading)
  if (reading == null || reading < 0) {
    throw httpError('Meter reading must be a number zero or greater.')
  }

  const readingAt = new Date().toISOString()
  const reader = await readerContext(orgId, userId)
  const { data, error } = await supabaseAdmin
    .from('equipment_meter_readings')
    .insert({
      org_id: orgId,
      equipment_id: equipmentId,
      reading,
      reading_at: readingAt,
      logged_by: userId || null,
      logged_by_name: reader.name,
      logged_by_department: reader.department,
      logged_by_designation: reader.designation,
    })
    .select('id, equipment_id, reading, reading_at, logged_by, logged_by_name, logged_by_department, logged_by_designation, created_at')
    .single()
  if (error) throw error

  await refreshLatest(orgId, equipmentId)
  return mapReading(data)
}

export async function deleteMeterReading(orgId, readingId, { assertEquipment } = {}) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('equipment_meter_readings')
    .select('id, equipment_id')
    .eq('org_id', orgId)
    .eq('id', readingId)
    .maybeSingle()
  if (findError) throw findError
  if (!existing) throw httpError('Meter reading not found', 404)

  const equipment = await getEquipmentRow(orgId, existing.equipment_id)
  if (assertEquipment) assertEquipment(equipment)

  const { error } = await supabaseAdmin
    .from('equipment_meter_readings')
    .delete()
    .eq('org_id', orgId)
    .eq('id', readingId)
  if (error) throw error

  await refreshLatest(orgId, existing.equipment_id)
  return { id: readingId, equipment_id: existing.equipment_id, deleted: true }
}
