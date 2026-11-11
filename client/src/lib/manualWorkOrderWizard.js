import { sortLayoutItems, parseLayoutId, layoutWithoutAreasMaster } from './formLayoutIds.js'
import { augmentLayoutWithEquipmentCatalog } from './equipmentLayoutFields.js'

const ASSET_PICKER_KEYS = new Set(['asset_picker', 'area_id', 'equipment_id'])

export function isAssetPickerLayoutField(field) {
  if (!field) return false
  const parsed = parseLayoutId(field.id)
  if (parsed.kind === 'system' && ASSET_PICKER_KEYS.has(parsed.value)) return true
  if (field.masterSource === 'areas' || field.masterSource === 'equipment') return true
  if (field.bindKey === 'area_id' || field.bindKey === 'equipment_id') return true
  return false
}

export function isAssetLayoutSection(sectionId, section, layout) {
  if (/asset/i.test(String(section?.label || ''))) return true
  return (layout?.fields || []).some((field) => (
    field.sectionId === sectionId && isAssetPickerLayoutField(field)
  ))
}

/** Manual WO layout with equipment catalog folded into the asset picker. */
export function prepareManualLayout(layout, catalogFields) {
  const augmented = layoutWithoutAreasMaster(augmentLayoutWithEquipmentCatalog(layout, catalogFields))
  if (!augmented?.fields?.length) return augmented
  const hasAssetPicker = augmented.fields.some((field) => {
    const parsed = parseLayoutId(field.id)
    return parsed.kind === 'system' && ASSET_PICKER_KEYS.has(parsed.value)
  })
  if (!hasAssetPicker) return augmented
  const catalogById = new Map((catalogFields || []).map((row) => [String(row.id), row]))
  return {
    ...augmented,
    fields: augmented.fields.filter((field) => {
      const parsed = parseLayoutId(field.id)
      if (parsed.kind !== 'catalog') return true
      const source = catalogById.get(String(parsed.value))
      return source?.field_source !== 'equipment'
    }),
  }
}

function sectionHasContent(layout, section) {
  const fields = (layout?.fields || []).filter((field) => field.sectionId === section.id && !field.skipped)
  const groups = (layout?.groups || []).filter((group) => group.sectionId === section.id && !group.skipped)
  if (fields.length || groups.length) return true
  return isAssetLayoutSection(section.id, section, layout)
}

export function manualWorkOrderSteps(layout) {
  return sortLayoutItems(layout?.sections || [])
    .filter((section) => sectionHasContent(layout, section))
    .map((section, index) => ({
      id: index + 1,
      key: section.id,
      sectionId: section.id,
      label: section.label || `Section ${index + 1}`,
    }))
}

export function layoutForSection(layout, sectionId) {
  if (!layout || !sectionId) return layout
  return {
    ...layout,
    sections: (layout.sections || []).filter((section) => section.id === sectionId),
    fields: (layout.fields || []).filter((field) => field.sectionId === sectionId),
    groups: (layout.groups || []).filter((group) => group.sectionId === sectionId),
  }
}

function normalizeLabel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Find a layout field by bindKey, system key, or loose label. */
export function findLayoutFieldByHint(layout, hints = []) {
  const wanted = hints.map(normalizeLabel).filter(Boolean)
  for (const field of layout?.fields || []) {
    const parsed = parseLayoutId(field?.id)
    const bind = field?.bindKey || (parsed.kind === 'system' ? parsed.value : '')
    const label = normalizeLabel(field?.label)
    if (wanted.includes(normalizeLabel(bind)) || wanted.includes(label)) return field
  }
  return null
}

export function readFieldValue(layout, values, hints = []) {
  const field = findLayoutFieldByHint(layout, hints)
  if (!field) return ''
  const value = values?.[field.id]
  return value == null ? '' : value
}

export function canonicalPriority(value) {
  const text = String(value || '').trim().toLowerCase()
  return text === 'high' || text === 'medium' || text === 'low' ? text : ''
}
