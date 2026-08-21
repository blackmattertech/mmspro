import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { createEquipment, orderedParentFields } from './equipmentService.js'
import {
  normalizeMasterName,
  primaryMasterToken,
  findDepartmentForLocation,
  scopePlacementOptions,
  departmentValidLabels,
} from './bulkMasterMatch.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'
const PLACEMENT_COLUMNS = ['Location', 'Department', 'Area']
const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])
const MULTI_OPTION_FIELD_TYPES = new Set(['checkbox'])

async function loadPlacementOptions(orgId) {
  const [locations, departments, areas] = await Promise.all([
    supabaseAdmin
      .from('org_locations')
      .select('id, name, is_active')
      .eq('org_id', orgId)
      .order('name'),
    supabaseAdmin
      .from('departments')
      .select('id, name, location_id, all_locations, is_active')
      .eq('org_id', orgId)
      .order('name'),
    supabaseAdmin
      .from('areas')
      .select('id, name, location_id, department_id, is_active')
      .eq('org_id', orgId)
      .order('name'),
  ])

  if (locations.error) throw locations.error
  if (departments.error) throw departments.error
  if (areas.error) throw areas.error

  return {
    locations: (locations.data || []).filter((l) => l.is_active !== false),
    departments: (departments.data || []).filter((d) => d.is_active !== false),
    areas: (areas.data || []).filter((a) => a.is_active !== false),
  }
}

/** Build a workbook: sheet 1 the import template, sheet 2 the valid values. */
export async function buildEquipmentTemplate(orgId, { locationId } = {}) {
  const fields = await loadOrgFields(orgId)
  const parents = orderedParentFields(fields)
  const { locations, departments, areas } = scopePlacementOptions(
    await loadPlacementOptions(orgId),
    locationId,
  )

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  const headers = [...parents.map((p) => p.name), ...PLACEMENT_COLUMNS]
  templateSheet.addRow(headers)
  templateSheet.getRow(1).font = { bold: true }
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  templateSheet.columns = headers.map((header) => ({
    width: Math.max(16, Math.min(40, header.length + 6)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
  const validColumns = []

  for (const field of parents) {
    if (OPTION_FIELD_TYPES.has(field.field_type) && (field.dropdown_options || []).length) {
      validColumns.push({
        header: field.name,
        values: field.dropdown_options || [],
      })
    }
  }
  validColumns.push({
    header: 'Location',
    values: locations.map((l) => l.name),
  })
  validColumns.push({
    header: 'Department',
    values: departments.flatMap((d) => departmentValidLabels(d, locations)),
  })
  validColumns.push({
    header: 'Area',
    values: areas.map((a) => {
      const loc = locations.find((l) => l.id === a.location_id)?.name
      const dept = departments.find((d) => d.id === a.department_id)?.name
      const suffix = [loc, dept].filter(Boolean).join(' / ')
      return suffix ? `${a.name} — ${suffix}` : a.name
    }),
  })

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

function formatDateValue(value, withTime) {
  if (value instanceof Date) {
    const iso = value.toISOString()
    return withTime ? iso.slice(0, 16) : iso.slice(0, 10)
  }
  return cellToString(value)
}

function resolvePlacement(rowValues, options) {
  const locName = normalizeMasterName(rowValues.Location)
  const location = options.locations.find((l) => normalizeMasterName(l.name) === locName)
  if (!location) throw new Error(`Unknown location "${rowValues.Location || ''}"`)

  const department = findDepartmentForLocation(options.departments, rowValues.Department, location)
  if (!department) throw new Error(`Unknown department "${rowValues.Department || ''}" for the location`)

  const areaToken = normalizeMasterName(primaryMasterToken(rowValues.Area))
  const area = options.areas.find((a) => (
    (normalizeMasterName(a.name) === areaToken || normalizeMasterName(a.code) === areaToken)
    && a.location_id === location.id
    && a.department_id === department.id
  ))
  if (!area) throw new Error(`Unknown area "${rowValues.Area || ''}" for the location/department`)

  return { location_id: location.id, department_id: department.id, area_id: area.id }
}

/** Parse an uploaded workbook and create equipment rows. */
export async function bulkImportEquipment(orgId, buffer, { locationId } = {}) {
  const fields = await loadOrgFields(orgId)
  const parents = orderedParentFields(fields)
  const parentByName = new Map(parents.map((p) => [normalizeMasterName(p.name), p]))
  const options = scopePlacementOptions(await loadPlacementOptions(orgId), locationId)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) throw Object.assign(new Error('No worksheet found in file'), { status: 400 })

  const headerRow = sheet.getRow(1)
  const columns = []
  headerRow.eachCell((cell, colNumber) => {
    columns.push({ colNumber, header: cellToString(cell.value) })
  })
  if (!columns.length) throw Object.assign(new Error('Template header row is empty'), { status: 400 })

  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    let hasData = false
    for (const { colNumber, header } of columns) {
      const raw = row.getCell(colNumber).value
      const text = cellToString(raw)
      rowValues[header] = text
      if (text) hasData = true
      // keep raw for date formatting
      rowValues[`__raw_${header}`] = raw
    }
    if (!hasData) continue

    try {
      const placement = resolvePlacement(rowValues, options)
      const values = []
      for (const { header } of columns) {
        if (PLACEMENT_COLUMNS.includes(header)) continue
        const field = parentByName.get(normalizeMasterName(header))
        if (!field) continue
        const rawText = rowValues[header]
        if (!rawText) continue

        if (MULTI_OPTION_FIELD_TYPES.has(field.field_type) && (field.dropdown_options || []).length) {
          const parts = rawText.split(',').map((s) => s.trim()).filter(Boolean)
          values.push({
            field_id: field.id,
            value_text: parts.join(', '),
            value_json: { values: parts },
          })
        } else if (field.field_type === 'date' || field.field_type === 'datetime') {
          values.push({
            field_id: field.id,
            value_text: formatDateValue(rowValues[`__raw_${header}`], field.field_type === 'datetime'),
          })
        } else {
          values.push({ field_id: field.id, value_text: rawText })
        }
      }

      await createEquipment(orgId, { ...placement, values }, { fields, skipDetail: true })
      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        let label = ''
        for (const { header } of columns) {
          if (PLACEMENT_COLUMNS.includes(header)) continue
          const text = rowValues[header]
          if (text) {
            label = text
            break
          }
        }
        results.preview.push({
          row: rowNumber,
          name: label || rowValues.Area || 'Equipment',
          location: rowValues.Location?.trim() || '',
          department: rowValues.Department?.trim() || '',
          area: rowValues.Area?.trim() || '',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
