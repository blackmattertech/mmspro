import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import {
  normalizeMasterName,
  findDepartmentForLocation,
  scopePlacementOptions,
  departmentValidLabels,
} from './bulkMasterMatch.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'
const TEMPLATE_COLUMNS = ['Name', 'Code', 'Location', 'Department']

async function loadPlacementOptions(orgId) {
  const [locations, departments] = await Promise.all([
    supabaseAdmin
      .from('org_locations')
      .select('id, name, is_active')
      .eq('org_id', orgId)
      .order('name'),
    supabaseAdmin
      .from('departments')
      .select('id, name, code, location_id, all_locations, is_active')
      .eq('org_id', orgId)
      .order('name'),
  ])

  if (locations.error) throw locations.error
  if (departments.error) throw departments.error

  return {
    locations: (locations.data || []).filter((l) => l.is_active !== false),
    departments: (departments.data || []).filter((d) => d.is_active !== false),
  }
}

export async function buildAreasTemplate(orgId, { locationId } = {}) {
  const loaded = await loadPlacementOptions(orgId)
  const { locations, departments } = scopePlacementOptions(loaded, locationId)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  templateSheet.addRow(TEMPLATE_COLUMNS)
  templateSheet.getRow(1).font = { bold: true }
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  templateSheet.columns = TEMPLATE_COLUMNS.map((header) => ({
    width: Math.max(16, Math.min(40, header.length + 6)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
  const validColumns = [
    {
      header: 'Location',
      values: locations.map((l) => l.name),
    },
    {
      header: 'Department',
      values: departments.flatMap((d) => departmentValidLabels(d, locations)),
    },
    {
      header: 'Department code',
      values: departments.map((d) => d.code).filter(Boolean),
    },
    {
      header: 'Department applies to',
      values: departments.map((d) => (
        d.all_locations
          ? 'All locations'
          : locations.find((l) => l.id === d.location_id)?.name || ''
      )),
    },
  ]

  validSheet.addRow(validColumns.map((c) => c.header))
  validSheet.getRow(1).font = { bold: true }
  validSheet.views = [{ state: 'frozen', ySplit: 1 }]
  const maxRows = Math.max(0, ...validColumns.map((c) => c.values.length))
  for (let i = 0; i < maxRows; i++) {
    validSheet.addRow(validColumns.map((c) => c.values[i] ?? ''))
  }
  validSheet.columns = validColumns.map((c) => ({
    width: Math.max(18, Math.min(48, c.header.length + 10)),
  }))

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function cellToString(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if (value.text) return String(value.text)
    if (value.result != null) return String(value.result)
    if (value.richText) return value.richText.map((r) => r.text).join('')
    return ''
  }
  return String(value).trim()
}

function resolveLocationDepartment(rowValues, options) {
  const locName = normalizeMasterName(rowValues.Location)
  const location = options.locations.find((l) => normalizeMasterName(l.name) === locName)
  if (!location) throw new Error(`Unknown location "${rowValues.Location || ''}"`)

  const department = findDepartmentForLocation(options.departments, rowValues.Department, location)
  if (!department) {
    throw new Error(`Unknown department "${rowValues.Department || ''}" for the location`)
  }

  return { location_id: location.id, department_id: department.id }
}

async function upsertAreaRow(orgId, { name, code, location_id, department_id }, { byCode, byKey, locationId }) {
  const trimmedName = name.trim()
  const normalizedCode = code?.trim() ? code.trim().toUpperCase() : null
  const key = `${normalizeMasterName(trimmedName)}|${location_id}|${department_id}`
  const existing = (
    (normalizedCode && byCode.get(normalizeMasterName(normalizedCode)))
    || byKey.get(key)
    || null
  )

  if (existing) {
    if (locationId && existing.location_id !== locationId) {
      throw new Error('Area code already exists at another location')
    }
    const nextCode = normalizedCode || existing.code || null
    const { error } = await supabaseAdmin
      .from('areas')
      .update({
        name: trimmedName,
        code: nextCode,
        location_id,
        department_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') throw new Error('Area code already exists')
      throw error
    }

    const next = {
      ...existing,
      name: trimmedName,
      code: nextCode,
      location_id,
      department_id,
    }
    if (existing.code) byCode.delete(normalizeMasterName(existing.code))
    byKey.delete(`${normalizeMasterName(existing.name)}|${existing.location_id}|${existing.department_id}`)
    if (next.code) byCode.set(normalizeMasterName(next.code), next)
    byKey.set(`${normalizeMasterName(next.name)}|${next.location_id}|${next.department_id}`, next)
    return { action: 'updated', id: existing.id }
  }

  const { data, error } = await supabaseAdmin
    .from('areas')
    .insert({
      org_id: orgId,
      location_id,
      department_id,
      name: trimmedName,
      code: normalizedCode,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Area code already exists')
    throw error
  }

  const created = {
    id: data.id,
    name: trimmedName,
    code: normalizedCode,
    location_id,
    department_id,
  }
  if (created.code) byCode.set(normalizeMasterName(created.code), created)
  byKey.set(key, created)
  return { action: 'created', id: data.id }
}

export async function bulkImportAreas(orgId, buffer, { locationId } = {}) {
  const options = scopePlacementOptions(await loadPlacementOptions(orgId), locationId)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) throw Object.assign(new Error('No worksheet found in file'), { status: 400 })

  const headerRow = sheet.getRow(1)
  const columnByHeader = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value)
    if (header) columnByHeader.set(normalizeMasterName(header), colNumber)
  })

  for (const col of TEMPLATE_COLUMNS) {
    if (!columnByHeader.has(normalizeMasterName(col))) {
      throw Object.assign(
        new Error(`Missing column "${col}" in template. Download the latest template and try again.`),
        { status: 400 },
      )
    }
  }

  const results = { created: 0, updated: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  const { data: existingAreas, error: existingError } = await supabaseAdmin
    .from('areas')
    .select('id, name, code, location_id, department_id')
    .eq('org_id', orgId)
  if (existingError) throw existingError

  const byCode = new Map()
  const byKey = new Map()
  for (const area of existingAreas || []) {
    if (area.code) byCode.set(normalizeMasterName(area.code), area)
    byKey.set(`${normalizeMasterName(area.name)}|${area.location_id}|${area.department_id}`, area)
  }

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    for (const col of TEMPLATE_COLUMNS) {
      const colNumber = columnByHeader.get(normalizeMasterName(col))
      rowValues[col] = cellToString(row.getCell(colNumber).value)
    }

    if (!TEMPLATE_COLUMNS.some((c) => rowValues[c])) continue

    try {
      if (!rowValues.Name?.trim()) throw new Error('Name is required')
      const placement = resolveLocationDepartment(rowValues, options)
      const saved = await upsertAreaRow(orgId, {
        name: rowValues.Name,
        code: rowValues.Code,
        ...placement,
      }, { byCode, byKey, locationId })
      if (saved.action === 'updated') results.updated += 1
      else results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name: rowValues.Name?.trim() || '',
          code: rowValues.Code?.trim() || '',
          location: rowValues.Location?.trim() || '',
          department: rowValues.Department?.trim() || '',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
