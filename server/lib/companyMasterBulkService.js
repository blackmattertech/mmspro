import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../services/supabase.js'
import {
  validatePostalCode,
  normalizePhoneE164,
  validatePhoneE164,
} from './contactValidation.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'

const LOCATION_COLUMNS = [
  'Name', 'Code', 'Address Line 1', 'Address Line 2',
  'City', 'State', 'Postal Code', 'Country', 'Primary',
]

const DEPARTMENT_COLUMNS = [
  'Name', 'Code', 'Description', 'Location', 'Parent Department',
]

const EMPLOYEE_COLUMNS = [
  'Employee ID', 'Name', 'Mobile', 'Email',
  'Location', 'Department', 'Login Required', 'Access Role',
]

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase()
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

function parseYesNo(value, fieldLabel) {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  const normalized = raw.toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  throw new Error(`${fieldLabel} must be Yes or No`)
}

async function buildWorkbook(templateColumns, validColumns) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  templateSheet.addRow(templateColumns)
  templateSheet.getRow(1).font = { bold: true }
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  templateSheet.columns = templateColumns.map((header) => ({
    width: Math.max(16, Math.min(40, header.length + 6)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
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

function readTemplateRows(workbook, expectedColumns) {
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET) || workbook.worksheets[0]
  if (!sheet) throw Object.assign(new Error('No worksheet found in file'), { status: 400 })

  const headerRow = sheet.getRow(1)
  const columnByHeader = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = cellToString(cell.value)
    if (header) columnByHeader.set(normalizeName(header), colNumber)
  })

  for (const col of expectedColumns) {
    if (!columnByHeader.has(normalizeName(col))) {
      throw Object.assign(
        new Error(`Missing column "${col}" in template. Download the latest template and try again.`),
        { status: 400 },
      )
    }
  }

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const rowValues = {}
    for (const col of expectedColumns) {
      const colNumber = columnByHeader.get(normalizeName(col))
      rowValues[col] = cellToString(row.getCell(colNumber).value)
    }
    if (!expectedColumns.some((c) => rowValues[c])) continue
    rows.push({ rowNumber, rowValues })
  }
  return rows
}

async function loadOrgMasters(orgId) {
  const [locations, departments, roles] = await Promise.all([
    supabaseAdmin
      .from('org_locations')
      .select('id, name, code, is_active')
      .eq('org_id', orgId)
      .order('name'),
    supabaseAdmin
      .from('departments')
      .select('id, name, code, location_id, all_locations, is_active')
      .eq('org_id', orgId)
      .order('name'),
    supabaseAdmin
      .from('org_access_roles')
      .select('id, name, is_active')
      .eq('org_id', orgId)
      .order('name'),
  ])

  if (locations.error) throw locations.error
  if (departments.error) throw departments.error
  if (roles.error) throw roles.error

  return {
    locations: (locations.data || []).filter((l) => l.is_active !== false),
    departments: (departments.data || []).filter((d) => d.is_active !== false),
    roles: (roles.data || []).filter((r) => r.is_active !== false),
  }
}

function locationLabel(locations, department) {
  if (department.all_locations) return 'All locations'
  return locations.find((l) => l.id === department.location_id)?.name || ''
}

// ─── Locations ───────────────────────────────────────────────

export async function buildLocationsTemplate() {
  return buildWorkbook(LOCATION_COLUMNS, [
    { header: 'Primary', values: ['Yes', 'No'] },
  ])
}

export async function bulkImportLocations(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, LOCATION_COLUMNS)
  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (const { rowNumber, rowValues } of rows) {
    try {
      if (!rowValues.Name?.trim()) throw new Error('Name is required')
      if (!rowValues.Code?.trim()) throw new Error('Code is required')

      const postalError = validatePostalCode(rowValues['Postal Code'], rowValues.Country)
      if (postalError) throw new Error(postalError)

      const isPrimary = parseYesNo(rowValues.Primary, 'Primary')
      const code = rowValues.Code.trim().toUpperCase()

      if (isPrimary) {
        await supabaseAdmin
          .from('org_locations')
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
      }

      const { error } = await supabaseAdmin
        .from('org_locations')
        .insert({
          org_id: orgId,
          name: rowValues.Name.trim(),
          code,
          address_line1: rowValues['Address Line 1']?.trim() || null,
          address_line2: rowValues['Address Line 2']?.trim() || null,
          city: rowValues.City?.trim() || null,
          state: rowValues.State?.trim() || null,
          postal_code: rowValues['Postal Code']?.trim() || null,
          country: rowValues.Country?.trim() || null,
          is_primary: isPrimary,
          is_active: true,
        })

      if (error) {
        if (error.code === '23505') throw new Error('Location code already exists')
        throw error
      }

      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name: rowValues.Name.trim(),
          code,
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}

// ─── Departments ─────────────────────────────────────────────

export async function buildDepartmentsTemplate(orgId) {
  const { locations, departments } = await loadOrgMasters(orgId)
  return buildWorkbook(DEPARTMENT_COLUMNS, [
    {
      header: 'Location',
      values: [
        'No location',
        'All locations',
        ...locations.map((l) => l.name),
      ],
    },
    {
      header: 'Parent Department',
      values: departments.map((d) => {
        const loc = locationLabel(locations, d)
        return loc ? `${d.name} — ${loc}` : d.name
      }),
    },
  ])
}

export async function bulkImportDepartments(orgId, buffer) {
  const options = await loadOrgMasters(orgId)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, DEPARTMENT_COLUMNS)
  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (const { rowNumber, rowValues } of rows) {
    try {
      if (!rowValues.Name?.trim()) throw new Error('Name is required')
      if (!rowValues.Code?.trim()) throw new Error('Code is required')

      const locRaw = String(rowValues.Location || '').trim()
      const locNorm = normalizeName(locRaw)
      let allLocations = false
      let locationId = null

      if (!locRaw || locNorm === 'no location' || locNorm === 'none') {
        allLocations = false
        locationId = null
      } else if (locNorm === 'all locations' || locNorm === 'all') {
        allLocations = true
        locationId = null
      } else {
        const location = options.locations.find((l) => normalizeName(l.name) === locNorm)
        if (!location) throw new Error(`Unknown location "${locRaw}"`)
        locationId = location.id
      }

      let parentId = null
      const parentRaw = String(rowValues['Parent Department'] || '').trim()
      if (parentRaw) {
        const parentNameOnly = parentRaw.includes('—')
          ? parentRaw.split('—')[0].trim()
          : parentRaw
        const parent = options.departments.find((d) => normalizeName(d.name) === normalizeName(parentNameOnly))
        if (!parent) throw new Error(`Unknown parent department "${parentRaw}"`)
        parentId = parent.id
      }

      const code = rowValues.Code.trim().toUpperCase()
      const { data, error } = await supabaseAdmin
        .from('departments')
        .insert({
          org_id: orgId,
          name: rowValues.Name.trim(),
          code,
          description: rowValues.Description?.trim() || null,
          all_locations: allLocations,
          location_id: locationId,
          parent_id: parentId,
          is_active: true,
        })
        .select('id, name, code, location_id, all_locations')
        .single()

      if (error) {
        if (error.code === '23505') throw new Error('Department code already exists')
        throw error
      }

      options.departments.push({
        id: data.id,
        name: data.name,
        code: data.code,
        location_id: data.location_id,
        all_locations: data.all_locations,
        is_active: true,
      })

      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name: rowValues.Name.trim(),
          code,
          location: locRaw || 'No location',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}

// ─── Employees ───────────────────────────────────────────────

export async function buildEmployeesTemplate(orgId) {
  const { locations, departments, roles } = await loadOrgMasters(orgId)
  return buildWorkbook(EMPLOYEE_COLUMNS, [
    {
      header: 'Location',
      values: locations.map((l) => l.name),
    },
    {
      header: 'Department',
      values: departments.map((d) => {
        const loc = locationLabel(locations, d)
        return loc ? `${d.name} — ${loc}` : d.name
      }),
    },
    {
      header: 'Login Required',
      values: ['Yes', 'No'],
    },
    {
      header: 'Access Role',
      values: roles.map((r) => r.name),
    },
  ])
}

export async function bulkImportEmployees(orgId, buffer) {
  const options = await loadOrgMasters(orgId)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, EMPLOYEE_COLUMNS)
  const results = { created: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250

  for (const { rowNumber, rowValues } of rows) {
    try {
      const empId = rowValues['Employee ID']?.trim()
      const name = rowValues.Name?.trim()
      if (!empId) throw new Error('Employee ID is required')
      if (!name) throw new Error('Name is required')

      const loginRequired = parseYesNo(rowValues['Login Required'], 'Login Required')
      const email = rowValues.Email?.trim() || null
      if (loginRequired && !email) {
        throw new Error('Email is required when Login Required is Yes')
      }

      let locationId = null
      const locRaw = String(rowValues.Location || '').trim()
      if (locRaw) {
        const location = options.locations.find((l) => normalizeName(l.name) === normalizeName(locRaw))
        if (!location) throw new Error(`Unknown location "${locRaw}"`)
        locationId = location.id
      }

      let departmentId = null
      const deptRaw = String(rowValues.Department || '').trim()
      if (deptRaw) {
        const deptNameOnly = deptRaw.includes('—')
          ? deptRaw.split('—')[0].trim()
          : deptRaw
        const department = options.departments.find((d) => {
          if (normalizeName(d.name) !== normalizeName(deptNameOnly)) return false
          if (!locationId) return true
          return d.all_locations || d.location_id === locationId
        })
        if (!department) {
          throw new Error(`Unknown department "${deptRaw}"${locationId ? ' for the location' : ''}`)
        }
        departmentId = department.id
      }

      let accessRoleId = null
      const roleRaw = String(rowValues['Access Role'] || '').trim()
      if (roleRaw) {
        const role = options.roles.find((r) => normalizeName(r.name) === normalizeName(roleRaw))
        if (!role) throw new Error(`Unknown access role "${roleRaw}"`)
        accessRoleId = role.id
      }

      const mobileRaw = rowValues.Mobile?.trim() || null
      let normalizedMobile = null
      if (mobileRaw) {
        const mobileError = validatePhoneE164(mobileRaw)
        if (mobileError) throw new Error(mobileError)
        normalizedMobile = normalizePhoneE164(mobileRaw)
      }

      const { error } = await supabaseAdmin
        .from('org_employees')
        .insert({
          org_id: orgId,
          emp_id: empId,
          name,
          mobile: normalizedMobile,
          email,
          location_id: locationId,
          department_id: departmentId,
          access_role_id: accessRoleId,
          login_required: false,
          is_active: true,
        })

      if (error) {
        if (error.code === '23505') throw new Error('Employee ID already exists')
        throw error
      }

      results.created += 1
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name,
          code: empId,
          location: locRaw || '',
          department: deptRaw || '',
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
