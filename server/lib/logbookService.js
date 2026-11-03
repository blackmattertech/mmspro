import { supabaseAdmin } from '../services/supabase.js'
import { applyIlikeSearch, listEnvelope } from './listQuery.js'
import { hierarchyParentFields } from './equipmentService.js'

const LIST_CAP = 5000

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
    field_values: row.field_values || [],
  }
}

function hasStoredFieldValue(item) {
  if (String(item?.value_text || '').trim()) return true
  const values = item?.value_json?.values
  return Array.isArray(values) && values.some((value) => String(value || '').trim())
}

export async function loadLogbookAssetFields(orgId) {
  const [{ data, error }, meterAssets] = await Promise.all([
    supabaseAdmin
      .from('equipment_fields')
      .select('id, name, kind, field_type, is_active, depends_on_parent_id, sort_order')
      .eq('org_id', orgId)
      .eq('kind', 'parent'),
    supabaseAdmin
      .from('equipment')
      .select('id')
      .eq('org_id', orgId)
      .eq('reading_required', true),
  ])
  if (error) throw error
  if (meterAssets.error) throw meterAssets.error
  const meterIds = (meterAssets.data || []).map((row) => row.id)
  const usedIds = new Set()
  if (meterIds.length) {
    const { data: stored, error: storedError } = await supabaseAdmin
      .from('equipment_values')
      .select('field_id, value_text, value_json')
      .eq('org_id', orgId)
      .in('equipment_id', meterIds)
    if (storedError) throw storedError
    for (const item of stored || []) {
      if (item?.field_id && hasStoredFieldValue(item)) usedIds.add(item.field_id)
    }
  }
  const visible = (data || []).filter((field) => (
    field.field_type !== 'image'
    && field.field_type !== 'file'
    && (field.is_active !== false || usedIds.has(field.id))
  ))
  return hierarchyParentFields(visible.map((field) => ({ ...field, is_active: true })))
    .map((field) => ({
      id: field.id,
      name: field.name,
      kind: 'parent',
      field_type: field.field_type,
      depends_on_parent_id: field.depends_on_parent_id || null,
      sort_order: field.sort_order ?? 0,
      is_active: true,
    }))
}

async function attachFieldValues(orgId, rows) {
  if (!rows?.length) return
  const { data, error } = await supabaseAdmin
    .from('equipment_values')
    .select('equipment_id, field_id, value_text, value_json')
    .eq('org_id', orgId)
    .in('equipment_id', rows.map((row) => row.id))
  if (error) throw error
  const byEquipment = new Map()
  for (const item of data || []) {
    const list = byEquipment.get(item.equipment_id) || []
    list.push({
      field_id: item.field_id,
      value_text: item.value_text,
      value_json: item.value_json,
    })
    byEquipment.set(item.equipment_id, list)
  }
  for (const row of rows) {
    row.field_values = byEquipment.get(row.id) || []
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
  if (!data) throw httpError('Asset not found', 404)
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

function activeFilters(filters) {
  const next = {}
  for (const [key, value] of Object.entries(filters || {})) {
    const text = String(value ?? '').trim()
    if (text) next[key] = text
  }
  return next
}

function fieldValueText(row, fieldId) {
  const match = (row?.field_values || []).find((item) => item.field_id === fieldId)
  if (!match) return ''
  const text = String(match.value_text || '').trim()
  if (text) return text
  const values = match.value_json?.values
  if (Array.isArray(values)) {
    return values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  const nested = match.value_json?.value ?? match.value_json?.label ?? match.value_json?.name
  return nested == null ? '' : String(nested).trim()
}

function columnText(row, columnId) {
  if (columnId === 'location') return row?.location_name || ''
  if (columnId === 'department') return row?.department_name || ''
  if (columnId === 'name') return row?.name || ''
  if (columnId === 'code') return row?.code || ''
  if (columnId === 'last_reading') return readingText(row?.last_reading)
  if (columnId === 'date') return dateText(row?.last_reading_at)
  if (columnId === 'time') return timeText(row?.last_reading_at)
  if (columnId === 'logged_by') {
    return [row?.logged_by_name, row?.logged_by_department, row?.logged_by_designation]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' · ')
  }
  if (String(columnId).startsWith('field:')) return fieldValueText(row, columnId.slice('field:'.length))
  return ''
}

function readingText(value) {
  if (value == null || value === '') return ''
  const reading = Number(value)
  if (!Number.isFinite(reading)) return ''
  return [
    reading.toLocaleString(undefined, { maximumFractionDigits: 4 }),
    reading.toLocaleString('en-IN', { maximumFractionDigits: 4 }),
    String(reading),
  ].join(' ')
}

function dateText(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const options = { month: 'short', day: 'numeric', year: 'numeric' }
  return [
    date.toLocaleDateString(undefined, options),
    date.toLocaleDateString('en-IN', options),
    date.toLocaleDateString('en-US', options),
    date.toISOString().slice(0, 10),
  ].join(' ')
}

function timeText(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const options = { hour: 'numeric', minute: '2-digit' }
  return [
    date.toLocaleTimeString(undefined, options),
    date.toLocaleTimeString('en-IN', options),
    date.toLocaleTimeString('en-US', options),
  ].join(' ')
}

function matchesColumnFilters(row, filters) {
  return Object.entries(filters).every(([columnId, value]) => (
    columnText(row, columnId).toLowerCase().includes(String(value).trim().toLowerCase())
  ))
}

function sortValue(row, columnId) {
  if (columnId === 'last_reading') return row.last_reading
  if (columnId === 'date' || columnId === 'time') {
    if (!row.last_reading_at) return null
    const time = new Date(row.last_reading_at).getTime()
    return Number.isNaN(time) ? null : time
  }
  const text = columnText(row, columnId).trim()
  return text || null
}

function compareSortValues(left, right, dir = 'asc') {
  const leftMissing = left == null || left === ''
  const rightMissing = right == null || right === ''
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1
  const base = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true })
  return dir === 'desc' ? -base : base
}

function sortLogbookRows(rows, { sort, sortDir, sortBy }) {
  const list = [...rows]
  if (sort) {
    list.sort((left, right) => compareSortValues(sortValue(left, sort), sortValue(right, sort), sortDir))
    return list
  }
  if (sortBy === 'newest' || sortBy === 'oldest') {
    const dir = sortBy === 'oldest' ? 'asc' : 'desc'
    list.sort((left, right) => compareSortValues(sortValue(left, 'date'), sortValue(right, 'date'), dir))
    return list
  }
  const dir = sortBy === 'name_desc' ? 'desc' : 'asc'
  list.sort((left, right) => compareSortValues(sortValue(left, 'name'), sortValue(right, 'name'), dir))
  return list
}

export async function listLogbookEquipment(orgId, {
  locationId = null,
  search = null,
  filters = {},
  sortBy = 'name_asc',
  sort = '',
  sortDir = 'asc',
  limit = 50,
  offset = 0,
} = {}) {
  const columnFilters = activeFilters(filters)
  const needsMemory = Object.keys(columnFilters).length > 0
    || Boolean(sort)
    || sortBy !== 'name_asc'

  let query = supabaseAdmin
    .from('equipment')
    .select(EQUIPMENT_LIST_SELECT, { count: 'exact' })
    .eq('org_id', orgId)
    .eq('reading_required', true)

  if (locationId) query = query.eq('location_id', locationId)
  query = applyIlikeSearch(query, search, ['name', 'code'])
  query = query.order('name', { ascending: true })
  if (needsMemory) query = query.limit(LIST_CAP)
  else query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  const rows = data || []
  await attachFieldValues(orgId, rows)
  const assetFields = await loadLogbookAssetFields(orgId)
  if (!needsMemory) {
    return listEnvelope(rows.map(mapEquipment), {
      total: count || 0,
      limit,
      offset,
      asset_fields: assetFields,
    })
  }

  const matched = sortLogbookRows(
    rows.map(mapEquipment).filter((row) => matchesColumnFilters(row, columnFilters)),
    { sort, sortDir, sortBy },
  )
  return listEnvelope(matched.slice(offset, offset + limit), {
    total: matched.length,
    limit,
    offset,
    asset_fields: assetFields,
  })
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
  const row = await getEquipmentRow(orgId, equipmentId)
  await attachFieldValues(orgId, [row])
  const equipment = mapEquipment(row)
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

export async function addMeterReading(orgId, equipmentId, body, userId, { readingAt } = {}) {
  const equipment = await getEquipmentRow(orgId, equipmentId)
  if (equipment.reading_required !== true) {
    throw httpError('Turn on Reading required for this asset before logging a meter reading.')
  }

  const reading = asReading(body?.reading)
  if (reading == null || reading < 0) {
    throw httpError('Meter reading must be a number zero or greater.')
  }

  const stamp = readingAt ? new Date(readingAt) : new Date()
  if (Number.isNaN(stamp.getTime())) throw httpError('Meter reading time is invalid.')
  const readingAtIso = stamp.toISOString()
  const reader = await readerContext(orgId, userId)
  const { data, error } = await supabaseAdmin
    .from('equipment_meter_readings')
    .insert({
      org_id: orgId,
      equipment_id: equipmentId,
      reading,
      reading_at: readingAtIso,
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
