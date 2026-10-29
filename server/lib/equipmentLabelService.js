import { supabaseAdmin } from '../services/supabase.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { ensureEquipmentQrCodes, orderedParentFields } from './equipmentService.js'
import { buildEquipmentLabelPdf } from './equipmentLabelPdf.js'
import {
  COPY_MAX,
  LABEL_CAP,
  OUTPUT_CAP,
  PAPER_PRESETS,
  assertLabelFitsPaper,
  assertMillimetreSize,
  paperFromPreset,
  toMillimetres,
} from './equipmentLabelPaper.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCAN_LIMIT = 20000
const PAGE_SIZE = 1000

const SLIM_SELECT = `
  id, name, code, qr_code, is_active, reading_required,
  location_id, department_id, area_id,
  org_locations(id, name),
  departments(id, name),
  areas(id, name)
`

const SORT_COLUMNS = new Set([
  'location',
  'department',
  'area',
  'name',
  'code',
  'reading_required',
  'active',
])

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function valueTextOf(item) {
  if (!item) return ''
  if (Array.isArray(item.value_json?.values)) {
    return item.value_json.values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  return String(item.value_text ?? '').trim()
}

function stringList(value, max = 200) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const item of value) {
    const text = String(item || '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function uuidList(value) {
  return stringList(value).filter((id) => UUID_RE.test(id))
}

function normalizeFilters(input = {}, scopedLocationId = null) {
  const fields = {}
  const rawFields = input.fields && typeof input.fields === 'object' ? input.fields : {}
  for (const [fieldId, selected] of Object.entries(rawFields)) {
    if (!UUID_RE.test(fieldId)) continue
    const values = stringList(selected)
    if (values.length) fields[fieldId] = values
  }
  let locationIds = uuidList(input.location_ids)
  if (scopedLocationId) locationIds = [scopedLocationId]
  const reading = input.reading_required === 'yes' || input.reading_required === 'no'
    ? input.reading_required
    : 'all'
  const active = input.active === 'yes' || input.active === 'no' ? input.active : 'all'
  return {
    locationIds,
    departmentIds: uuidList(input.department_ids),
    areaIds: uuidList(input.area_ids),
    names: stringList(input.names),
    codes: stringList(input.codes),
    reading,
    active,
    fields,
  }
}

function normalizeSort(input) {
  if (!Array.isArray(input)) return []
  const levels = []
  for (const level of input) {
    const column = String(level?.column || '').trim()
    const direction = level?.direction === 'desc' ? 'desc' : 'asc'
    if (SORT_COLUMNS.has(column) || /^field:[0-9a-f-]{36}$/i.test(column)) {
      levels.push({ column, direction })
    }
    if (levels.length >= 5) break
  }
  return levels
}

function applySqlFilters(query, filters) {
  if (filters.locationIds.length) query = query.in('location_id', filters.locationIds)
  if (filters.departmentIds.length) query = query.in('department_id', filters.departmentIds)
  if (filters.areaIds.length) query = query.in('area_id', filters.areaIds)
  if (filters.names.length && filters.names.length <= 80) query = query.in('name', filters.names)
  if (filters.codes.length && filters.codes.length <= 80) query = query.in('code', filters.codes)
  if (filters.reading === 'yes') query = query.eq('reading_required', true)
  if (filters.reading === 'no') query = query.or('reading_required.eq.false,reading_required.is.null')
  if (filters.active === 'yes') query = query.eq('is_active', true)
  if (filters.active === 'no') query = query.eq('is_active', false)
  return query
}

function inSet(value, selected) {
  if (!selected.length) return true
  const text = String(value || '').trim().toLowerCase()
  return selected.some((item) => item.toLowerCase() === text)
}

function applyIdentityFilters(rows, filters) {
  const namesInMemory = filters.names.length > 80
  const codesInMemory = filters.codes.length > 80
  if (!namesInMemory && !codesInMemory) return rows
  return rows.filter((row) => (
    (!namesInMemory || inSet(row.name, filters.names))
    && (!codesInMemory || inSet(row.code, filters.codes))
  ))
}

function fieldTokens(item) {
  const tokens = new Set()
  const full = valueTextOf(item).toLowerCase()
  if (full) tokens.add(full)
  full.split(',').forEach((part) => {
    const text = part.trim().toLowerCase()
    if (text) tokens.add(text)
  })
  if (Array.isArray(item?.value_json?.values)) {
    for (const value of item.value_json.values) {
      const text = String(value || '').trim().toLowerCase()
      if (text) tokens.add(text)
    }
  }
  return tokens
}

function rowMatchesFields(row, filters) {
  const entries = Object.entries(filters.fields)
  if (!entries.length) return true
  const byField = new Map((row._filterValues || []).map((item) => [item.field_id, item]))
  return entries.every(([fieldId, selected]) => {
    const tokens = fieldTokens(byField.get(fieldId))
    return selected.some((value) => tokens.has(value.toLowerCase()))
  })
}

async function fetchCandidates(orgId, filters) {
  const rows = []
  let offset = 0
  while (offset < SCAN_LIMIT) {
    let query = supabaseAdmin
      .from('equipment')
      .select(SLIM_SELECT)
      .eq('org_id', orgId)
    query = applySqlFilters(query, filters)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    const { data, error } = await query
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
    offset += PAGE_SIZE
  }
  throw httpError('Too many asset records to scan. Narrow the location or department first.')
}

async function countCandidates(orgId, filters) {
  let query = supabaseAdmin
    .from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  query = applySqlFilters(query, filters)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function loadValuesFor(orgId, equipmentIds, fieldIds) {
  const byEquipment = new Map()
  if (!equipmentIds.length || !fieldIds?.length) return byEquipment
  const chunkSize = 150
  for (let index = 0; index < equipmentIds.length; index += chunkSize) {
    const chunk = equipmentIds.slice(index, index + chunkSize)
    const { data, error } = await supabaseAdmin
      .from('equipment_values')
      .select('equipment_id, field_id, value_text, value_json')
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
      .in('field_id', fieldIds)
    if (error) throw error
    for (const item of data || []) {
      const list = byEquipment.get(item.equipment_id) || []
      list.push(item)
      byEquipment.set(item.equipment_id, list)
    }
  }
  return byEquipment
}

function sortText(row, column) {
  switch (column) {
    case 'location':
      return row.org_locations?.name || ''
    case 'department':
      return row.departments?.name || ''
    case 'area':
      return row.areas?.name || ''
    case 'name':
      return row.name || ''
    case 'code':
      return row.code || ''
    case 'reading_required':
      return row.reading_required ? 'Yes' : 'No'
    case 'active':
      return row.is_active === false ? 'No' : 'Yes'
    default: {
      if (!column.startsWith('field:')) return ''
      const fieldId = column.slice(6)
      const item = (row.field_values || []).find((value) => value.field_id === fieldId)
      return valueTextOf(item)
    }
  }
}

function compareValues(left, right) {
  const leftBlank = !String(left || '').trim()
  const rightBlank = !String(right || '').trim()
  if (leftBlank && rightBlank) return 0
  if (leftBlank) return 1
  if (rightBlank) return -1
  return String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true })
}

function sortRows(rows, levels) {
  const keys = levels.length ? levels : [{ column: 'name', direction: 'asc' }]
  return [...rows].sort((a, b) => {
    for (const level of keys) {
      const cmp = compareValues(sortText(a, level.column), sortText(b, level.column))
      if (cmp) return level.direction === 'desc' ? -cmp : cmp
    }
    return String(a.id).localeCompare(String(b.id))
  })
}

function displayField(row, field) {
  const item = (row.field_values || []).find((value) => value.field_id === field.id)
  if (field.field_type === 'image' || field.field_type === 'file') {
    return valueTextOf(item) ? 'on file' : '—'
  }
  return valueTextOf(item) || '—'
}

function labelLines(row, fields, printFields) {
  const selected = new Set(Array.isArray(printFields) ? printFields : [])
  const system = [
    ['name', `Name: ${row.name || '—'}`],
    ['code', `Code: ${row.code || '—'}`],
    ['location', `Location: ${row.org_locations?.name || '—'}`],
    ['department', `Department: ${row.departments?.name || '—'}`],
    ['area', `Area: ${row.areas?.name || '—'}`],
    ['reading_required', `Reading required: ${row.reading_required ? 'Yes' : 'No'}`],
    ['active', `Active: ${row.is_active === false ? 'No' : 'Yes'}`],
  ]
  const lines = system.filter(([key]) => selected.has(key)).map(([, line]) => line)
  for (const field of orderedParentFields(fields)) {
    if (!selected.has(`field:${field.id}`)) continue
    lines.push(`${field.name}: ${displayField(row, field)}`)
  }
  return lines
}

function overCapError(count) {
  return httpError(`Too many labels (${count}). Narrow the filters to ${LABEL_CAP} or fewer.`)
}

export async function queryEquipmentLabels(orgId, {
  scopedLocationId = null,
  filters: rawFilters = {},
  sort: rawSort = [],
  forPdf = false,
} = {}) {
  const filters = normalizeFilters(rawFilters, scopedLocationId)
  const sort = normalizeSort(rawSort)
  const fieldIds = Object.keys(filters.fields)
  const needsScan = fieldIds.length > 0 || filters.names.length > 80 || filters.codes.length > 80

  if (!needsScan) {
    const count = await countCandidates(orgId, filters)
    if (!forPdf) return { count, rows: [] }
    if (count > LABEL_CAP) throw overCapError(count)
    if (!count) return { count: 0, rows: [] }
    let query = supabaseAdmin.from('equipment').select(SLIM_SELECT).eq('org_id', orgId)
    query = applySqlFilters(query, filters).order('id', { ascending: true }).range(0, count - 1)
    const { data, error } = await query
    if (error) throw error
    return { count, rows: data || [], sort }
  }

  const candidates = applyIdentityFilters(await fetchCandidates(orgId, filters), filters)
  let count = 0
  const matched = []
  const valueMap = fieldIds.length
    ? await loadValuesFor(orgId, candidates.map((row) => row.id), fieldIds)
    : new Map()
  for (const row of candidates) {
    row._filterValues = valueMap.get(row.id) || []
    if (!rowMatchesFields(row, filters)) continue
    count += 1
    if (forPdf && count <= LABEL_CAP) matched.push(row)
  }
  if (!forPdf) return { count, rows: [] }
  if (count > LABEL_CAP) throw overCapError(count)
  return { count, rows: matched, sort }
}

async function attachAllFieldValues(orgId, rows, fields) {
  const parents = orderedParentFields(fields)
  const fieldIds = parents.map((field) => field.id)
  const valueMap = await loadValuesFor(orgId, rows.map((row) => row.id), fieldIds)
  for (const row of rows) {
    const stored = new Map((valueMap.get(row.id) || []).map((item) => [item.field_id, item]))
    row.field_values = parents.map((field) => {
      const item = stored.get(field.id)
      return {
        field_id: field.id,
        field_name: field.name,
        field_type: field.field_type,
        value_text: item?.value_text ?? null,
        value_json: item?.value_json ?? null,
      }
    })
  }
  return rows
}

const PRINT_SYSTEM_FIELDS = new Set([
  'name', 'code', 'location', 'department', 'area', 'reading_required', 'active',
])

export function normalizePrintFields(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const item of value) {
    const key = String(item || '').trim()
    if (!key || seen.has(key)) continue
    if (PRINT_SYSTEM_FIELDS.has(key) || /^field:[0-9a-f-]{36}$/i.test(key)) {
      seen.add(key)
      out.push(key)
    }
    if (out.length >= 40) break
  }
  return out
}

function sortColumnLabel(column, fields) {
  const labels = {
    location: 'Location',
    department: 'Department',
    area: 'Area',
    name: 'Name',
    code: 'Code',
    reading_required: 'Reading required',
    active: 'Active',
  }
  if (labels[column]) return labels[column]
  if (String(column).startsWith('field:')) {
    const fieldId = column.slice(6)
    return (fields || []).find((field) => field.id === fieldId)?.name || 'Field'
  }
  return 'Group'
}

function buildSheetItems(rows, sortLevels, fields, printFields, copies) {
  const levels = (sortLevels || []).filter((level) => level?.column)
  const items = []
  let previous = null
  for (const row of rows) {
    if (levels.length) {
      const keys = levels.map((level) => String(sortText(row, level.column) || '').trim() || '—')
      const changedAt = previous == null
        ? 0
        : keys.findIndex((key, index) => key !== previous[index])
      const from = changedAt === -1 ? keys.length : changedAt
      for (let index = from; index < keys.length; index += 1) {
        items.push({
          kind: 'heading',
          level: index,
          text: `${sortColumnLabel(levels[index].column, fields)}: ${keys[index]}`,
        })
      }
      previous = keys
    }
    const record = {
      kind: 'label',
      name: row.name || '',
      qrValue: row.qr_code || '',
      lines: labelLines(row, fields, printFields),
    }
    for (let copy = 0; copy < copies; copy += 1) items.push(record)
  }
  return items
}

export function normalizeCopies(value) {
  if (value == null || value === '') return 1
  const copies = Math.floor(Number(value))
  if (!Number.isFinite(copies) || copies < 1 || copies > COPY_MAX) {
    throw httpError(`Copies must be between 1 and ${COPY_MAX}.`)
  }
  return copies
}

export async function buildEquipmentQrLabels(orgId, options) {
  const copies = normalizeCopies(options.copies)
  const printFields = normalizePrintFields(options.print_fields)
  if (!printFields.length) throw httpError('Select at least one field to print on the label.')
  const { count, rows, sort } = await queryEquipmentLabels(orgId, { ...options, forPdf: true })
  if (!count) throw httpError('No assets match these filters.')
  const total = count * copies
  if (total > OUTPUT_CAP) {
    throw httpError(`Too many labels (${total}). Narrow the filters or reduce the number of copies. The limit is ${OUTPUT_CAP} labels.`)
  }
  const fields = await loadOrgFields(orgId)
  await attachAllFieldValues(orgId, rows, fields)
  await ensureEquipmentQrCodes(orgId, rows)
  const ordered = sortRows(rows, sort || [])
  const items = buildSheetItems(ordered, sort || [], fields, printFields, copies)
  assertLabelFitsPaper(options.label, options.paper)
  const pdf = await buildEquipmentLabelPdf(items, options.paper, options.label)
  return { pdf, count, copies, total }
}

export async function listLabelSizes(orgId) {
  const { data, error } = await supabaseAdmin
    .from('equipment_label_sizes')
    .select('id, name, width_mm, height_mm')
    .eq('org_id', orgId)
    .order('name')
  if (error) {
    if (error.code === '42P01') {
      throw httpError('Apply supabase-patches/105-equipment-label-sizes.sql before printing labels.', 500)
    }
    throw error
  }
  return {
    presets: PAPER_PRESETS,
    cap: LABEL_CAP,
    sizes: (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      width_mm: Number(row.width_mm),
      height_mm: Number(row.height_mm),
    })),
  }
}

export async function createLabelSize(orgId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name || name.length > 80) throw httpError('Enter a name up to 80 characters.')
  const widthMm = toMillimetres(body.width, body.unit)
  const heightMm = toMillimetres(body.height, body.unit)
  assertMillimetreSize(widthMm, heightMm)
  const { data, error } = await supabaseAdmin
    .from('equipment_label_sizes')
    .insert({ org_id: orgId, name, width_mm: widthMm, height_mm: heightMm })
    .select('id, name, width_mm, height_mm')
    .single()
  if (error) {
    if (error.code === '23505') throw httpError('A label size with that name already exists.', 409)
    if (error.code === '23514') throw httpError('Width and height must be between 20 and 500 mm.')
    if (error.code === '42P01') {
      throw httpError('Apply supabase-patches/105-equipment-label-sizes.sql before saving a paper size.', 500)
    }
    throw error
  }
  return {
    id: data.id,
    name: data.name,
    width_mm: Number(data.width_mm),
    height_mm: Number(data.height_mm),
  }
}

export async function deleteLabelSize(orgId, id) {
  if (!UUID_RE.test(String(id || ''))) throw httpError('Label size not found.', 404)
  const { data, error } = await supabaseAdmin
    .from('equipment_label_sizes')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw httpError('Label size not found.', 404)
  return { id, deleted: true }
}

export async function resolveLabelPaper(orgId, paper = {}, { fallback = 'a4', noun = 'paper' } = {}) {
  if (paper.custom_id) {
    if (!UUID_RE.test(String(paper.custom_id))) throw httpError(`Choose a ${noun} size.`)
    const { data, error } = await supabaseAdmin
      .from('equipment_label_sizes')
      .select('width_mm, height_mm')
      .eq('org_id', orgId)
      .eq('id', paper.custom_id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw httpError(`Choose a ${noun} size.`)
    return { width_mm: Number(data.width_mm), height_mm: Number(data.height_mm) }
  }
  const preset = paperFromPreset(paper.preset || fallback)
  if (!preset) throw httpError(`Choose a ${noun} size.`)
  return { width_mm: preset.width_mm, height_mm: preset.height_mm }
}

export async function listEquipmentIdentityValues(orgId, column, scopedLocationId) {
  const col = column === 'code' ? 'code' : 'name'
  const values = []
  const seen = new Set()
  let offset = 0
  while (offset < SCAN_LIMIT && values.length < 3000) {
    let query = supabaseAdmin
      .from('equipment')
      .select(col)
      .eq('org_id', orgId)
      .order(col, { ascending: true })
    if (scopedLocationId) query = query.eq('location_id', scopedLocationId)
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = data || []
    for (const row of page) {
      const text = String(row[col] || '').trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      values.push(text)
    }
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
  return values.slice(0, 3000)
}
