/**
 * When a form layout maps Equipment to the equipment master, inject active
 * equipment catalog fields into the same section so admins do not re-add them.
 */
import {
  catalogId,
  defaultColSpanForType,
  parseLayoutId,
} from './formLayoutIds.js'
import { fieldValuesFromEquipment } from './workRequestAssetPicker.js'
import { orderedHierarchyFields } from './assetHierarchy.js'

export function isEquipmentMasterField(field) {
  if (!field) return false
  if (field.masterSource === 'equipment' || field.bindKey === 'equipment_id') return true
  const parsed = parseLayoutId(field.id)
  return parsed.kind === 'master' && parsed.value === 'equipment'
}

export function layoutHasEquipmentMaster(layout) {
  return (layout?.fields || []).some(isEquipmentMasterField)
}

export function equipmentCatalogParents(catalogFields = []) {
  return (catalogFields || [])
    .filter((row) => (
      row.kind === 'parent'
      && row.is_active !== false
      && row.field_source === 'equipment'
    ))
    .sort((a, b) => (
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || String(a.name || '').localeCompare(String(b.name || ''))
    ))
}

/**
 * Append missing equipment catalog parents after the Equipment master field,
 * in the superadmin level order.
 */
export function augmentLayoutWithEquipmentCatalog(layout, catalogFields = []) {
  if (!layout || !layoutHasEquipmentMaster(layout)) return layout

  const hasAssetPicker = (layout.fields || []).some((field) => {
    const parsed = parseLayoutId(field.id)
    return parsed.kind === 'system' && parsed.value === 'asset_picker'
  })
  if (hasAssetPicker) return layout

  const equipmentField = (layout.fields || []).find(isEquipmentMasterField)
  const sectionId = equipmentField?.sectionId
  if (!sectionId) return layout

  const used = new Set((layout.fields || []).map((field) => field.id))
  const sectionOrders = (layout.fields || [])
    .filter((field) => field.sectionId === sectionId)
    .map((field) => field.order ?? 0)
  let nextOrder = sectionOrders.length ? Math.max(...sectionOrders) + 1 : (equipmentField.order ?? 0) + 1

  const extras = []
  for (const parent of orderedHierarchyFields(equipmentCatalogParents(catalogFields))) {
    const id = catalogId(parent.id)
    if (used.has(id)) continue
    extras.push({
      id,
      sectionId,
      order: nextOrder++,
      colSpan: defaultColSpanForType(parent.field_type),
      required: false,
      autoFromEquipment: true,
    })
    used.add(id)
  }

  if (!extras.length) return layout
  return {
    ...layout,
    fields: [...(layout.fields || []), ...extras],
  }
}

/** Shape a getEquipment() detail row like a work-request catalog row. */
export function catalogRowFromEquipmentDetail(detail) {
  if (!detail) return null
  return {
    ...detail,
    area_name: detail.area_name || detail.areas?.name || null,
    values: equipmentValuesByFieldId(detail),
  }
}

function fieldNameKey(value) {
  return String(value || '').trim().toLowerCase()
}

function masterSourceOf(field) {
  if (!field) return ''
  if (field.masterSource) return field.masterSource
  const parsed = parseLayoutId(field.id)
  return parsed.kind === 'master' ? parsed.value : ''
}

/**
 * Values to write when an equipment record is chosen: area (and location /
 * department, when those pickers sit in the same section) plus catalog and
 * custom fields such as code, name, type, and image.
 */
export function valuesFromEquipmentSelection(detail, layout, catalogFields = []) {
  if (!detail || !layout) return {}
  const equipmentField = (layout.fields || []).find(isEquipmentMasterField)
  const sectionId = equipmentField?.sectionId
  const sectionFields = (layout.fields || []).filter((field) => (
    !sectionId || field.sectionId === sectionId
  ))
  const out = {}

  for (const field of sectionFields) {
    const source = masterSourceOf(field)
    if (source === 'areas' && detail.area_id) out[field.id] = detail.area_id
    if (source === 'locations' && detail.location_id) out[field.id] = detail.location_id
    if (source === 'departments' && detail.department_id) out[field.id] = detail.department_id
  }

  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  const fillTargets = []
  for (const field of sectionFields) {
    if (isEquipmentMasterField(field)) continue
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'catalog') {
      const row = catalogById.get(parsed.value)
      if (row) fillTargets.push(row)
    } else if (parsed.kind === 'field') {
      fillTargets.push({
        id: field.id,
        name: field.label || '',
        field_type: field.fieldType || 'text',
      })
    }
  }

  const filled = prefillValuesForFields(detail, fillTargets)
  for (const [id, value] of Object.entries(filled)) {
    if (value) out[id] = value
  }

  const imageUrl = detail.image_signed_url || detail.image_url || ''
  if (imageUrl) {
    for (const field of sectionFields) {
      const parsed = parseLayoutId(field.id)
      const catalog = parsed.kind === 'catalog' ? catalogById.get(parsed.value) : null
      const type = field.fieldType || catalog?.field_type || ''
      const name = field.label || catalog?.name || ''
      const isImage = type === 'image' || /image/i.test(name)
      if (!isImage) continue
      const key = catalog?.id || field.id
      if (!out[key]) out[key] = imageUrl
    }
  }

  return out
}

/** Fill form fields from an equipment detail: same field id, then the same field name. */
export function prefillValuesForFields(detail, fields) {
  const row = catalogRowFromEquipmentDetail(detail)
  if (!row) return {}
  const next = fieldValuesFromEquipment(row, fields)
  const byName = new Map()
  for (const item of detail.field_values || []) {
    const name = fieldNameKey(item.field_name)
    const text = item.value_text
      || (Array.isArray(item.value_json?.values) ? item.value_json.values.join(', ') : '')
    if (name && text) byName.set(name, String(text))
  }
  if (detail.name) byName.set('name', String(detail.name).trim())
  if (detail.code) byName.set('code', String(detail.code).trim())
  for (const field of fields || []) {
    if (next[field.id]) continue
    const name = fieldNameKey(field.name || field.label)
    if (name && byName.has(name)) next[field.id] = byName.get(name)
  }
  return next
}

/** Build field_id → text map from WR catalog row or equipment detail API. */
export function equipmentValuesByFieldId(row) {
  if (!row) return {}
  if (row.values && typeof row.values === 'object' && !Array.isArray(row.values)) {
    const out = {}
    for (const [key, value] of Object.entries(row.values)) {
      if (value == null || value === '') continue
      out[key] = Array.isArray(value) ? value.join(', ') : String(value)
    }
    return out
  }

  const out = {}
  for (const item of row.field_values || []) {
    const text = item.value_text
      || (Array.isArray(item.value_json?.values) ? item.value_json.values.join(', ') : '')
      || ''
    if (text) out[item.field_id] = String(text)
  }
  for (const item of Array.isArray(row.values) ? row.values : []) {
    const text = item.value_text
      || (Array.isArray(item.value_json?.values) ? item.value_json.values.join(', ') : '')
      || ''
    if (item.field_id && text) out[item.field_id] = String(text)
  }
  return out
}
