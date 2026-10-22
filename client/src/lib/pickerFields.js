const LABEL_ALIASES = {
  workcenters: 'workcenter',
  jobpriority: 'priority',
  jobstatus: 'status',
  plantfacility: 'location',
  equipmentname: 'equipment',
}

export function canonicalLabel(label) {
  const key = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return LABEL_ALIASES[key] || key
}

export function mergePickerColumns(baseColumns = [], catalogFields = [], { source = '', includeImages = false } = {}) {
  const defs = baseColumns.map((col) => ({ ...col }))
  const used = new Set(defs.map((col) => canonicalLabel(col.label)))
  const ids = new Set(defs.map((col) => col.id))

  for (const field of catalogFields || []) {
    if (!field?.id || !field?.name) continue
    const isImage = field.field_type === 'file' || field.field_type === 'image'
    if (isImage && !includeImages) continue
    if (field.kind && field.kind !== 'parent') continue
    if (source && field.field_source && field.field_source !== source) continue
    if (used.has(canonicalLabel(field.name))) continue
    const id = `field:${field.id}`
    if (ids.has(id)) continue
    defs.push({
      id,
      label: field.name,
      defaultVisible: isImage,
      fieldId: field.id,
      fieldName: field.name,
      fieldType: field.field_type,
    })
    used.add(canonicalLabel(field.name))
    ids.add(id)
  }

  return defs
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

function storedText(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => storedText(item)).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (value.value_text) return String(value.value_text).trim()
    if (value.label) return String(value.label).trim()
    if (value.name) return String(value.name).trim()
    if (Array.isArray(value.values)) return value.values.map((item) => storedText(item)).filter(Boolean).join(', ')
    if (value.value != null) return storedText(value.value)
    return ''
  }
  return String(value).trim()
}

function equipmentFieldText(row, fieldId) {
  const list = Array.isArray(row?.field_values) ? row.field_values : []
  const match = list.find((item) => item.field_id === fieldId)
  if (!match) return ''
  return storedText(match.value_text || match.value_json)
}

function mapText(map, fieldId) {
  if (!map || typeof map !== 'object' || Array.isArray(map) || !fieldId) return ''
  const bare = String(fieldId).replace(/^(catalog|field|custom|system):/, '')
  const keys = [fieldId, bare, `catalog:${bare}`, `field:${bare}`, `custom:${bare}`]
  for (const key of keys) {
    const text = storedText(map[key])
    if (text) return text
  }
  return ''
}

export function readCatalogText(row, column) {
  const id = column?.id || column
  if (!String(id).startsWith('field:') && !column?.fieldId) return ''
  const fieldId = column?.fieldId || String(id).slice('field:'.length)
  const name = column?.fieldName || column?.label || ''
  const saved = mapText(row?.field_values, fieldId)
  if (saved) return saved
  const formValue = mapText(row?.form_field_values, fieldId)
  if (formValue) return formValue
  const fromEquipment = equipmentFieldText(row, fieldId)
  if (fromEquipment) return fromEquipment
  return hierarchyValue(row, name, fieldId)
}

export function equipmentImageSrc(row, column) {
  const text = readCatalogText(row, column)
  if (/^(https?:|data:image\/)/i.test(text)) return text
  const recordImage = String(row?.image_signed_url || '').trim()
  const imageColumn = column?.fieldType === 'image'
    || column?.fieldType === 'file'
    || /image/i.test(column?.label || column?.fieldName || '')
  if (recordImage && imageColumn) return recordImage
  return ''
}

export function formatPickerValue(row, column) {
  const catalog = readCatalogText(row, column)
  if (catalog) return catalog
  if (String(column?.id || '').startsWith('field:')) return '—'
  const raw = row?.[column.id]
  if (raw == null || raw === '') return '—'
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
  if (typeof raw === 'object') return raw.name || raw.label || '—'
  if (/_at$/.test(column.id)) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return date.toLocaleString()
  }
  return String(raw)
}
