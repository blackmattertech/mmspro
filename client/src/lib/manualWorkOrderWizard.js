import {
  sortLayoutItems,
  parseLayoutId,
  isPrimaryAssetPickerField,
  isAssetPickerControlField,
} from './formLayoutIds.js'

export {
  isPrimaryAssetPickerField as isAssetPickerLayoutField,
} from './formLayoutIds.js'

export function isAssetLayoutSection(sectionId, section, layout) {
  return (layout?.fields || []).some((field) => (
    field.sectionId === sectionId && isPrimaryAssetPickerField(field)
  ))
}

/** Manual WO layout — Asset picker already normalized via useFormLayout. */
export function prepareManualLayout(layout) {
  return layout
}

function sectionHasContent(layout, section) {
  const fields = (layout?.fields || []).filter((field) => field.sectionId === section.id && !field.skipped)
  const groups = (layout?.groups || []).filter((group) => group.sectionId === section.id && !group.skipped)
  if (fields.length || groups.length) return true
  return isAssetLayoutSection(section.id, section, layout)
}

export function manualWorkOrderSections(layout) {
  return sortLayoutItems(layout?.sections || [])
    .filter((section) => sectionHasContent(layout, section))
}

/** Flat one-section steps (legacy helper). Prefer manualWorkOrderPages for the wizard UI. */
export function manualWorkOrderSteps(layout) {
  return manualWorkOrderSections(layout).map((section, index) => ({
    id: index + 1,
    key: section.id,
    sectionId: section.id,
    sectionIds: [section.id],
    label: section.label || `Section ${index + 1}`,
  }))
}

/**
 * Group layout sections into wizard pages (default: 2 sections per page).
 * Labels join section titles with " · " so the stepper stays readable.
 */
export function manualWorkOrderPages(layout, { sectionsPerPage = 2 } = {}) {
  const sections = manualWorkOrderSections(layout)
  const size = Math.max(1, Number(sectionsPerPage) || 2)
  const pages = []
  for (let i = 0; i < sections.length; i += size) {
    const chunk = sections.slice(i, i + size)
    const sectionIds = chunk.map((section) => section.id)
    pages.push({
      id: pages.length + 1,
      key: sectionIds.join('+'),
      sectionIds,
      sectionId: sectionIds[0],
      label: chunk
        .map((section) => section.label || section.id)
        .filter(Boolean)
        .join(' · ') || `Step ${pages.length + 1}`,
    })
  }
  return pages
}

export function layoutForSections(layout, sectionIds = []) {
  if (!layout) return layout
  const ids = new Set((sectionIds || []).filter(Boolean))
  if (!ids.size) return layout
  return {
    ...layout,
    sections: (layout.sections || []).filter((section) => ids.has(section.id)),
    fields: (layout.fields || []).filter((field) => ids.has(field.sectionId)),
    groups: (layout.groups || []).filter((group) => ids.has(group.sectionId)),
  }
}

export function layoutForSection(layout, sectionId) {
  if (!layout || !sectionId) return layout
  return layoutForSections(layout, [sectionId])
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

export { isAssetPickerControlField }
