import { normalizeName, parseList } from './excelTemplate.js'

const SKIP_FIELD_TYPES = new Set(['file', 'image'])
const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

export const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

function dependencyDepth(field, byId = null, seen = new Set()) {
  if (!field?.depends_on_parent_id) return 0
  if (seen.has(field.id)) return 0
  seen.add(field.id)
  const parent = byId?.get(field.depends_on_parent_id)
  return 1 + dependencyDepth(parent, byId, seen)
}

function sortFieldsInSectionOrder(fields) {
  const byId = new Map(fields.map((field) => [field.id, field]))
  return [...fields].sort((a, b) => {
    if ((a._sectionIndex ?? 0) !== (b._sectionIndex ?? 0)) {
      return (a._sectionIndex ?? 0) - (b._sectionIndex ?? 0)
    }
    const depthA = dependencyDepth(a, byId)
    const depthB = dependencyDepth(b, byId)
    if (depthA !== depthB) return depthA - depthB
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.name || '').localeCompare(String(b.name || ''))
  })
}

export function formFieldsFromSchema(schema) {
  const fields = []
  ;(schema?.sections || []).forEach((section, sectionIndex) => {
    for (const field of section.fields || []) {
      if (SKIP_FIELD_TYPES.has(field.field_type)) continue
      fields.push({
        ...field,
        section_name: field.section_name || section.name || null,
        _sectionIndex: sectionIndex,
      })
    }
  })
  return sortFieldsInSectionOrder(fields)
}

export function formFieldsFromOrgFields(rows) {
  const list = rows || []
  const sections = list
    .filter((row) => row.kind === 'section' && row.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
  const sectionIndex = new Map(sections.map((section, index) => [section.id, index]))
  const fields = list
    .filter((row) => (
      row.kind === 'parent'
      && row.is_active !== false
      && !SKIP_FIELD_TYPES.has(row.field_type)
    ))
    .map((field) => ({
      ...field,
      _sectionIndex: sectionIndex.has(field.section_id)
        ? sectionIndex.get(field.section_id)
        : sections.length,
    }))
  return sortFieldsInSectionOrder(fields)
}

function uniquify(name, used) {
  let next = name
  let index = 2
  while (used.has(normalizeName(next))) {
    next = `${name} (${index})`
    index += 1
  }
  used.add(normalizeName(next))
  return next
}

export function formFieldColumnName(field, byId) {
  const chain = []
  let current = field
  const seen = new Set()
  while (current?.depends_on_parent_id && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.depends_on_parent_id)
    if (!parent) break
    chain.unshift(parent.name)
    current = parent
  }
  if (chain.length) return `${chain.join(' → ')} → ${field.name}`
  if (field.section_name) return `${field.section_name} / ${field.name}`
  return field.name
}

export function mapFormFieldColumns(fields) {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const used = new Set()
  return fields.map((field) => ({
    field,
    column: uniquify(formFieldColumnName(field, byId), used),
  }))
}

export function validColumnsForFormFields(mapped) {
  return mapped
    .filter(({ field }) => OPTION_FIELD_TYPES.has(field.field_type) && (field.dropdown_options || []).length)
    .map(({ field, column }) => ({
      header: column,
      values: field.dropdown_options || [],
    }))
}

export function parseFormFieldCell(field, text) {
  const raw = String(text || '').trim()
  if (!raw) return undefined
  if (field.field_type === 'checkbox') {
    const lowered = raw.toLowerCase()
    if (lowered === 'yes' || lowered === 'true') return true
    if (lowered === 'no' || lowered === 'false') return false
    return parseList(raw)
  }
  if (field.field_type === 'number') {
    const num = Number(raw)
    if (Number.isNaN(num)) throw new Error(`Invalid number for "${field.name}"`)
    return num
  }
  return raw
}

export function valuesFromMappedRow(row, mapped) {
  const values = {}
  for (const { field, column } of mapped) {
    const parsed = parseFormFieldCell(field, row[column])
    if (parsed !== undefined && parsed !== '') values[field.id] = parsed
  }
  return values
}

export function numberedGroupColumns(groupLabel, specs, count) {
  const columns = []
  for (let index = 1; index <= count; index += 1) {
    for (const spec of specs) {
      columns.push(`${groupLabel} ${index} ${spec.header}`)
    }
  }
  return columns
}

export function readNumberedGroup(row, groupLabel, specs, count) {
  const items = []
  for (let index = 1; index <= count; index += 1) {
    const item = {}
    let any = false
    for (const spec of specs) {
      const value = String(row[`${groupLabel} ${index} ${spec.header}`] || '').trim()
      if (value) any = true
      item[spec.key] = value
    }
    if (any) items.push(item)
  }
  return items
}

export function sampleMappedRow(mapped) {
  const sample = {}
  for (const { field, column } of mapped) {
    if (OPTION_FIELD_TYPES.has(field.field_type) && field.dropdown_options?.[0]) {
      sample[column] = field.dropdown_options[0]
    }
  }
  return sample
}
