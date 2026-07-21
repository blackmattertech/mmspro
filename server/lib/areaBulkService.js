import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'
const TEMPLATE_COLUMNS = ['Name', 'Code', 'Location', 'Department']

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
}

async function loadPlacementOptions(orgId) {
  const [locations, departments] = await Promise.all([
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
  ])

  if (locations.error) throw locations.error
  if (departments.error) throw departments.error

  return {
    locations: (locations.data || []).filter((l) => l.is_active !== false),
    departments: (departments.data || []).filter((d) => d.is_active !== false),
  }
}

export async function buildAreasTemplate(orgId) {
  const { locations, departments } = await loadPlacementOptions(orgId)

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
      values: departments.map((d) => {
        const loc = d.all_locations
          ? 'All locations'
          : locations.find((l) => l.id === d.location_id)?.name
        return loc ? `${d.name} — ${loc}` : d.name
      }),
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
  const locName = normalizeName(rowValues.Location)
  const location = options.locations.find((l) => normalizeName(l.name) === locName)
  if (!location) throw new Error(`Unknown location "${rowValues.Location || ''}"`)

  const deptCell = String(rowValues.Department || '').trim()
  const deptNameOnly = deptCell.includes('—')
    ? deptCell.split('—')[0].trim()
    : deptCell
  const deptName = normalizeName(deptNameOnly)
  const department = options.departments.find((d) => (
    normalizeName(d.name) === deptName
    && (d.all_locations || d.location_id === location.id)
  ))
  if (!department) {
    throw new Error(`Unknown department "${rowValues.Department || ''}" for the location`)
  }

  return { location_id: location.id, department_id: department.id }
}

async function createAreaRow(orgId, { name, code, location_id, department_id }) {
  const normalizedCode = code?.trim() ? code.trim().toUpperCase() : null
  const { data, error } = await supabaseAdmin
    .from('areas')
    .insert({
      org_id: orgId,
      location_id,
      department_id,
      name: name.trim(),
      code: normalizedCode,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Area code already exists')
    throw error
  }
  return data
}

export async function bulkImportAreas(orgId, buffer) {
  const options = await loadPlacementOptions(orgId)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) throw Object.assign(new Error('No worksheet found in file'), { status: 400 })

  const headerRow = sheet.getRow(1)
  const columnByHeader = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value)
    if (header) columnByHeader.set(normalizeName(header), colNumber)
  })

  for (const col of TEMPLATE_COLUMNS) {
    if (!columnByHeader.has(normalizeName(col))) {
      throw Object.assign(
        new Error(`Missing column "${col}" in template. Download the latest template and try again.`),
        { status: 400 },
      )
    }
  }

  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    for (const col of TEMPLATE_COLUMNS) {
      const colNumber = columnByHeader.get(normalizeName(col))
      rowValues[col] = cellToString(row.getCell(colNumber).value)
    }

    if (!TEMPLATE_COLUMNS.some((c) => rowValues[c])) continue

    try {
      if (!rowValues.Name?.trim()) throw new Error('Name is required')
      const placement = resolveLocationDepartment(rowValues, options)
      await createAreaRow(orgId, {
        name: rowValues.Name,
        code: rowValues.Code,
        ...placement,
      })
      results.created += 1
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
