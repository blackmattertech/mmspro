import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { createEquipment, orderedParentFields } from './equipmentService.js'
import {
  normalizeMasterName,
  findDepartmentForLocation,
  scopePlacementOptions,
} from './bulkMasterMatch.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'
const PLACEMENT_COLUMNS = ['Location', 'Department', 'Area']
const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])
const MULTI_OPTION_FIELD_TYPES = new Set(['checkbox'])

function isAreaParent(field) {
  return normalizeMasterName(field?.name) === 'area'
}

/** Placement columns already represented by a super-admin parent field are omitted. */
function extraPlacementColumns(parents) {
  const used = new Set((parents || []).map((field) => normalizeMasterName(field.name)))
  return PLACEMENT_COLUMNS.filter((name) => !used.has(normalizeMasterName(name)))
}

function cellsForHeader(cells, header) {
  const key = normalizeMasterName(header)
  return cells.filter((cell) => normalizeMasterName(cell.header) === key)
}

function firstFilledCell(cells, header) {
  const matches = cellsForHeader(cells, header)
  return matches.find((cell) => cell.text) || matches[0] || { text: '', raw: null }
}

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
      .select('id, name, code, location_id, department_id, is_active')
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
  const headers = [...parents.map((p) => p.name), ...extraPlacementColumns(parents)]
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
  const pushValid = (header, values) => {
    if (validColumns.some((column) => normalizeMasterName(column.header) === normalizeMasterName(header))) return
    validColumns.push({ header, values })
  }
  pushValid('Location', locations.map((l) => l.name))
  pushValid('Department', departments.map((d) => d.name))
  const areaHeader = parents.find(isAreaParent)?.name || 'Area'
  pushValid(areaHeader, [...new Set(areas.map((area) => area.name).filter(Boolean))])

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

function resolvePlacement(cells, options) {
  const locText = firstFilledCell(cells, 'Location').text
  let location = null
  if (locText) {
    const locName = normalizeMasterName(locText)
    location = options.locations.find((item) => normalizeMasterName(item.name) === locName) || null
    if (!location) throw new Error(`Unknown location "${locText}"`)
  }

  const deptText = firstFilledCell(cells, 'Department').text
  let department = null
  if (deptText) {
    if (location) {
      department = findDepartmentForLocation(options.departments, deptText, location)
      if (!department) throw new Error(`Unknown department "${deptText}" for the location`)
    } else {
      const token = normalizeMasterName(deptText)
      const matches = options.departments.filter((item) => (
        normalizeMasterName(item.name) === token || normalizeMasterName(item.code) === token
      ))
      if (matches.length === 1) department = matches[0]
      else if (!matches.length) throw new Error(`Unknown department "${deptText}"`)
      else throw new Error(`Department "${deptText}" needs a location`)
    }
  }

  if (!location && department?.location_id) {
    location = options.locations.find((item) => item.id === department.location_id) || null
  }

  return {
    location_id: location?.id || null,
    department_id: department?.id || null,
  }
}

/** Parse an uploaded workbook and create equipment rows. */
export async function bulkImportEquipment(orgId, buffer, { locationId } = {}) {
  const fields = await loadOrgFields(orgId)
  const parents = orderedParentFields(fields)
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
    const cells = columns.map(({ colNumber, header }) => ({
      header,
      raw: row.getCell(colNumber).value,
      text: cellToString(row.getCell(colNumber).value),
    }))
    if (!cells.some((cell) => cell.text)) continue

    try {
      const placement = resolvePlacement(cells, options)
      const values = []
      const seenFields = new Set()
      for (const field of parents) {
        if (seenFields.has(field.id)) continue
        const cell = firstFilledCell(cells, field.name)
        if (!cell.text) continue
        seenFields.add(field.id)

        if (MULTI_OPTION_FIELD_TYPES.has(field.field_type) && (field.dropdown_options || []).length) {
          const parts = cell.text.split(',').map((part) => part.trim()).filter(Boolean)
          values.push({
            field_id: field.id,
            value_text: parts.join(', '),
            value_json: { values: parts },
          })
        } else if (field.field_type === 'date' || field.field_type === 'datetime') {
          values.push({
            field_id: field.id,
            value_text: formatDateValue(cell.raw, field.field_type === 'datetime'),
          })
        } else {
          values.push({ field_id: field.id, value_text: cell.text })
        }
      }

      await createEquipment(orgId, { ...placement, values }, { fields, skipDetail: true })
      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        const areaParent = parents.find(isAreaParent)
        const areaText = areaParent ? firstFilledCell(cells, areaParent.name).text : firstFilledCell(cells, 'Area').text
        const label = parents.map((field) => firstFilledCell(cells, field.name).text).find(Boolean) || areaText
        results.preview.push({
          row: rowNumber,
          name: label || 'Equipment',
          location: firstFilledCell(cells, 'Location').text,
          department: firstFilledCell(cells, 'Department').text,
          area: areaText,
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
