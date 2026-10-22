import { loadOrgCatalogFields } from './orgFormLayouts.js'

const LABEL_ALIASES = {
  workcenters: 'workcenter',
  jobpriority: 'priority',
  jobstatus: 'status',
  plantfacility: 'location',
  equipmentname: 'equipment',
}

function canonicalLabel(label) {
  const key = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return LABEL_ALIASES[key] || key
}

function storedText(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => storedText(item)).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (value.value_text) return String(value.value_text).trim()
    if (value.label) return String(value.label).trim()
    if (value.name) return String(value.name).trim()
    if (value.value != null) return storedText(value.value)
    return ''
  }
  return String(value).trim()
}

function hierarchyValue(row, name, fieldId) {
  const items = Array.isArray(row?.asset_hierarchy) ? row.asset_hierarchy : []
  if (fieldId) {
    const byId = items.find((item) => item.field_id === fieldId && String(item.value || '').trim())
    if (byId) return String(byId.value).trim()
  }
  const key = canonicalLabel(name)
  if (!key) return ''
  const byName = items.find((item) => canonicalLabel(item.field_name) === key && String(item.value || '').trim())
  return byName ? String(byName.value).trim() : ''
}

export function catalogCellValue(row, field) {
  const fieldId = field.id
  const saved = row?.field_values && !Array.isArray(row.field_values)
    ? storedText(row.field_values[fieldId])
    : ''
  if (saved) return saved
  const formValue = storedText(row?.form_field_values?.[fieldId])
  if (formValue) return formValue
  const list = Array.isArray(row?.field_values) ? row.field_values : []
  const match = list.find((item) => item.field_id === fieldId)
  if (match) {
    const text = storedText(match.value_text || match.value_json || match.value)
    if (text) return text
  }
  return hierarchyValue(row, field.name, fieldId)
}

export async function withCatalogColumns(orgId, columns, { source = '' } = {}) {
  let fields = []
  try {
    fields = await loadOrgCatalogFields(orgId)
  } catch {
    fields = []
  }
  const used = new Set((columns || []).map((col) => canonicalLabel(col.label)))
  const extra = []
  for (const field of fields) {
    if (!field?.id || !field?.name) continue
    if (field.is_active === false) continue
    if (field.field_type === 'file' || field.field_type === 'image') continue
    if (field.kind && field.kind !== 'parent') continue
    if (source && field.field_source && field.field_source !== source) continue
    if (used.has(canonicalLabel(field.name))) continue
    used.add(canonicalLabel(field.name))
    extra.push({
      label: field.name,
      value: (row) => catalogCellValue(row, field),
    })
  }
  return [...columns, ...extra]
}
