import ExcelJS from 'exceljs'
import {
  loadOrgFields,
  createAssetField,
  updateAssetFieldSchema,
  updateAssetFieldDropdownValues,
  updateAssetFieldActive,
  parseDependsOnOptions,
} from './assetFieldService.js'

const TEMPLATE_SHEET = 'Template'
const VALID_VALUES_SHEET = 'Valid values'

const SECTION_COLUMNS = ['Name', 'Order', 'Active']
const PARENT_COLUMNS = [
  'Name',
  'Section',
  'Type',
  'Order',
  'Required',
  'Active',
  'Options',
  'Depends On Field',
  'Depends On Values',
]

const CHILD_COLUMNS = ['Name', 'Section', 'Parent', 'Active']

const FIELD_TYPE_ALIASES = [
  ['text', 'Text'],
  ['textarea', 'Textarea'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['datetime', 'Date & time'],
  ['image', 'Image'],
  ['file', 'File', 'Files'],
  ['checkbox', 'Checkbox'],
  ['dropdown', 'Dropdown'],
  ['radio', 'Radio button', 'Radio'],
]

const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

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

function parseYesNo(value, fieldLabel, { defaultValue = true } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return defaultValue
  const normalized = raw.toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  throw new Error(`${fieldLabel} must be Yes or No`)
}

function parseOrder(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const order = Number(raw)
  if (!Number.isInteger(order) || order < 0) {
    throw new Error('Order must be a whole number of 0 or greater')
  }
  return order
}

function parseFieldType(value) {
  const raw = String(value ?? '').trim()
  if (!raw) throw new Error('Type is required')
  const normalized = normalizeName(raw).replace(/\s+and\s+/g, ' & ').replace(/\s+/g, ' ')
  const match = FIELD_TYPE_ALIASES.find((row) => (
    row.some((name) => normalizeName(name) === normalized)
  ))
  if (!match) throw new Error(`Unknown type "${raw}"`)
  return match[0]
}

function fieldTypeLabel(value) {
  return FIELD_TYPE_ALIASES.find(([code]) => code === value)?.[1] || value || ''
}

function parseOptionList(value) {
  return String(value ?? '')
    .split(/[\n\r,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function yesNo(value) {
  return value === false ? 'No' : 'Yes'
}

function parentLabel(sectionName, parentName) {
  return `${sectionName} → ${parentName}`
}

async function buildWorkbook(templateColumns, rows, validColumns) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMS Pro'
  workbook.created = new Date()

  const templateSheet = workbook.addWorksheet(TEMPLATE_SHEET)
  templateSheet.addRow(templateColumns)
  templateSheet.getRow(1).font = { bold: true }
  templateSheet.views = [{ state: 'frozen', ySplit: 1 }]
  for (const row of rows) templateSheet.addRow(row)
  templateSheet.columns = templateColumns.map((header) => ({
    width: Math.max(16, Math.min(42, header.length + 8)),
  }))

  const validSheet = workbook.addWorksheet(VALID_VALUES_SHEET)
  validSheet.addRow(validColumns.map((column) => column.header))
  validSheet.getRow(1).font = { bold: true }
  validSheet.views = [{ state: 'frozen', ySplit: 1 }]
  const maxRows = Math.max(0, ...validColumns.map((column) => column.values.length))
  for (let i = 0; i < maxRows; i++) {
    validSheet.addRow(validColumns.map((column) => column.values[i] ?? ''))
  }
  validSheet.columns = validColumns.map((column) => ({
    width: Math.max(18, Math.min(48, column.header.length + 10)),
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
    if (header && header.toLowerCase() !== 'import errors') {
      columnByHeader.set(normalizeName(header), colNumber)
    }
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
    if (!expectedColumns.some((col) => rowValues[col])) continue
    rows.push({ rowNumber, rowValues })
  }
  return rows
}

function findByName(list, name) {
  const key = normalizeName(name)
  return list.find((item) => normalizeName(item.name) === key) || null
}

function resolveDependsOn(allFields, rawField, rawValues) {
  const fieldRaw = String(rawField ?? '').trim()
  const values = parseOptionList(rawValues)
  if (!fieldRaw && !values.length) {
    return { depends_on_parent_id: null, depends_on_option: null }
  }
  if (!fieldRaw || !values.length) {
    throw new Error('Depends On Field and Depends On Values are both required when used')
  }

  const optionParents = allFields.filter((field) => (
    field.kind === 'parent' && OPTION_FIELD_TYPES.has(field.field_type)
  ))
  const byLabel = optionParents.find((field) => (
    normalizeName(parentLabel(field.section_name || '', field.name)) === normalizeName(fieldRaw)
  ))
  const byName = optionParents.filter((field) => normalizeName(field.name) === normalizeName(fieldRaw))
  const match = byLabel || (byName.length === 1 ? byName[0] : null)
  if (!match) {
    throw new Error(`Unknown Depends On Field "${fieldRaw}". Use a value from the Valid values sheet.`)
  }

  return {
    depends_on_parent_id: match.id,
    depends_on_option: values,
  }
}

export async function buildSectionsTemplate(orgId) {
  const fields = await loadOrgFields(orgId)
  const sections = fields.filter((field) => field.kind === 'section')
  const rows = sections.map((section) => [
    section.name,
    section.sort_order ?? 0,
    yesNo(section.is_active),
  ])

  return buildWorkbook(SECTION_COLUMNS, rows, [
    { header: 'Active', values: ['Yes', 'No'] },
  ])
}

export async function bulkImportSections(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, SECTION_COLUMNS)
  const results = { created: 0, updated: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250
  let current = await loadOrgFields(orgId)

  for (const { rowNumber, rowValues } of rows) {
    try {
      const name = rowValues.Name?.trim()
      if (!name) throw new Error('Name is required')
      const sortOrder = parseOrder(rowValues.Order)
      const isActive = parseYesNo(rowValues.Active, 'Active')
      const existing = findByName(current.filter((field) => field.kind === 'section'), name)
      const payload = {
        kind: 'section',
        name,
        sort_order: sortOrder,
        is_active: isActive,
      }

      if (existing) {
        await updateAssetFieldSchema(orgId, existing.id, payload)
        results.updated += 1
      } else {
        await createAssetField(orgId, payload)
        results.created += 1
      }
      current = await loadOrgFields(orgId)

      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({ row: rowNumber, name })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}

export async function buildParentsTemplate(orgId) {
  const fields = await loadOrgFields(orgId)
  const sections = fields.filter((field) => field.kind === 'section')
  const parents = fields.filter((field) => field.kind === 'parent')
  const optionParents = parents.filter((field) => OPTION_FIELD_TYPES.has(field.field_type))

  const rows = parents.map((parent) => [
    parent.name,
    parent.section_name || '',
    fieldTypeLabel(parent.field_type),
    parent.sort_order ?? 0,
    yesNo(parent.is_required),
    yesNo(parent.is_active),
    (parent.dropdown_options || []).join(', '),
    parent.depends_on_parent_id
      ? parentLabel(parent.depends_on_section_name || '', parent.depends_on_parent_name || '')
      : '',
    parseDependsOnOptions(parent.depends_on_option).join(', '),
  ])

  return buildWorkbook(PARENT_COLUMNS, rows, [
    { header: 'Section', values: sections.map((section) => section.name) },
    { header: 'Type', values: FIELD_TYPE_ALIASES.map(([, label]) => label) },
    { header: 'Required', values: ['Yes', 'No'] },
    { header: 'Active', values: ['Yes', 'No'] },
    {
      header: 'Depends On Field',
      values: optionParents.map((parent) => parentLabel(parent.section_name || '', parent.name)),
    },
  ])
}

export async function bulkImportParents(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, PARENT_COLUMNS)
  const results = { created: 0, updated: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250
  const savedRows = []
  let current = await loadOrgFields(orgId)

  for (const { rowNumber, rowValues } of rows) {
    try {
      const name = rowValues.Name?.trim()
      if (!name) throw new Error('Name is required')
      const sectionName = rowValues.Section?.trim()
      if (!sectionName) throw new Error('Section is required')

      const section = findByName(current.filter((field) => field.kind === 'section'), sectionName)
      if (!section) throw new Error(`Unknown section "${sectionName}"`)

      const fieldType = parseFieldType(rowValues.Type)
      const sortOrder = parseOrder(rowValues.Order)
      const isRequired = parseYesNo(rowValues.Required, 'Required', { defaultValue: false })
      const isActive = parseYesNo(rowValues.Active, 'Active')
      const options = parseOptionList(rowValues.Options)
      const hasDependency = Boolean(
        String(rowValues['Depends On Field'] ?? '').trim()
        || String(rowValues['Depends On Values'] ?? '').trim(),
      )

      const existing = current.find((field) => (
        field.kind === 'parent'
        && field.section_id === section.id
        && normalizeName(field.name) === normalizeName(name)
      ))

      const payload = {
        kind: 'parent',
        name,
        section_id: section.id,
        field_type: fieldType,
        sort_order: sortOrder,
        is_required: isRequired,
        is_active: isActive,
      }
      if (OPTION_FIELD_TYPES.has(fieldType) && (options.length || !existing)) {
        payload.dropdown_options = options
      }

      const saved = existing
        ? await updateAssetFieldSchema(orgId, existing.id, payload)
        : await createAssetField(orgId, payload)
      if (!saved?.id) throw new Error('Could not save parent field')
      current = await loadOrgFields(orgId)

      if (existing) results.updated += 1
      else results.created += 1

      savedRows.push({
        rowNumber,
        id: saved.id,
        name,
        sectionName: section.name,
        rowValues,
        hasDependency,
      })
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  for (const item of savedRows) {
    if (!item.hasDependency) {
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({ row: item.rowNumber, name: item.name, section: item.sectionName })
      }
      continue
    }
    try {
      current = await loadOrgFields(orgId)
      const dependency = resolveDependsOn(
        current,
        item.rowValues['Depends On Field'],
        item.rowValues['Depends On Values'],
      )
      await updateAssetFieldSchema(orgId, item.id, {
        depends_on_parent_id: dependency.depends_on_parent_id,
        depends_on_option: dependency.depends_on_option,
      })
      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({ row: item.rowNumber, name: item.name, section: item.sectionName })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({
        row: item.rowNumber,
        message: `Saved without dependency: ${err.message}`,
      })
    }
  }

  return results
}

function findOptionParent(fields, sectionName, parentName) {
  const section = findByName(fields.filter((field) => field.kind === 'section'), sectionName)
  if (!section) throw new Error(`Unknown section "${sectionName}"`)

  const optionParents = fields.filter((field) => (
    field.kind === 'parent'
    && field.section_id === section.id
    && OPTION_FIELD_TYPES.has(field.field_type)
  ))
  const rawParent = String(parentName || '').trim()
  const byLabel = optionParents.find((field) => (
    normalizeName(parentLabel(field.section_name || section.name, field.name)) === normalizeName(rawParent)
  ))
  const byName = optionParents.filter((field) => normalizeName(field.name) === normalizeName(rawParent))
  const match = byLabel || (byName.length === 1 ? byName[0] : null)
  if (match) return match

  const anyParent = fields.find((field) => (
    field.kind === 'parent'
    && field.section_id === section.id
    && (
      normalizeName(field.name) === normalizeName(rawParent)
      || normalizeName(parentLabel(field.section_name || section.name, field.name)) === normalizeName(rawParent)
    )
  ))
  if (anyParent) {
    throw new Error(`"${anyParent.name}" is a ${fieldTypeLabel(anyParent.field_type)} field and cannot have child values`)
  }
  throw new Error(`Unknown option parent "${rawParent}" in section "${sectionName}". Use a Dropdown, Radio, or Checkbox parent from the Valid values sheet.`)
}

export async function buildChildrenTemplate(orgId) {
  const fields = await loadOrgFields(orgId)
  const sections = fields.filter((field) => field.kind === 'section')
  const optionParents = fields.filter((field) => (
    field.kind === 'parent' && OPTION_FIELD_TYPES.has(field.field_type)
  ))
  const children = fields.filter((field) => field.kind === 'child')
  const rows = children.map((child) => [
    child.name,
    child.section_name || '',
    child.parent_name || '',
    yesNo(child.is_active),
  ])

  return buildWorkbook(CHILD_COLUMNS, rows, [
    { header: 'Section', values: sections.map((section) => section.name) },
    {
      header: 'Parent',
      values: optionParents.map((parent) => parentLabel(parent.section_name || '', parent.name)),
    },
    { header: 'Active', values: ['Yes', 'No'] },
  ])
}

export async function bulkImportChildren(orgId, buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const rows = readTemplateRows(workbook, CHILD_COLUMNS)
  const results = { created: 0, updated: 0, failed: 0, errors: [], preview: [] }
  const MAX_PREVIEW = 250
  let current = await loadOrgFields(orgId)

  for (const { rowNumber, rowValues } of rows) {
    try {
      const name = rowValues.Name?.trim()
      if (!name) throw new Error('Name is required')
      const sectionName = rowValues.Section?.trim()
      if (!sectionName) throw new Error('Section is required')
      const parentName = rowValues.Parent?.trim()
      if (!parentName) throw new Error('Parent is required')
      const isActive = parseYesNo(rowValues.Active, 'Active')

      const parent = findOptionParent(current, sectionName, parentName)
      const existing = current.find((field) => (
        field.kind === 'child'
        && field.parent_id === parent.id
        && normalizeName(field.name) === normalizeName(name)
      ))

      if (existing) {
        if (Boolean(existing.is_active !== false) !== isActive) {
          await updateAssetFieldActive(orgId, existing.id, isActive)
        }
        results.updated += 1
      } else {
        const nextOptions = [...(parent.dropdown_options || []), name]
        await updateAssetFieldDropdownValues(orgId, parent.id, nextOptions)
        if (!isActive) {
          current = await loadOrgFields(orgId)
          const created = current.find((field) => (
            field.kind === 'child'
            && field.parent_id === parent.id
            && normalizeName(field.name) === normalizeName(name)
          ))
          if (created) await updateAssetFieldActive(orgId, created.id, false)
        }
        results.created += 1
      }
      current = await loadOrgFields(orgId)

      if (results.preview.length < MAX_PREVIEW) {
        results.preview.push({
          row: rowNumber,
          name,
          section: parent.section_name || sectionName,
          parent: parent.name,
        })
      }
    } catch (err) {
      results.failed += 1
      results.errors.push({ row: rowNumber, message: err.message })
    }
  }

  return results
}
