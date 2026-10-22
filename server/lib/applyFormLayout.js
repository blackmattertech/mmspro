import {
  catalogId,
  fieldLayoutId,
  isSystemId,
  normalizeColSpan,
  parseLayoutId,
  sortLayoutItems,
} from './formLayoutIds.js'

function indexSchema(schema) {
  const sections = new Map()
  const fields = new Map()
  for (const section of schema?.sections || []) {
    const layoutId = fieldLayoutId(section)
    sections.set(layoutId, { ...section, layout_id: layoutId })
    for (const field of section.fields || []) {
      const fieldId = fieldLayoutId(field)
      fields.set(fieldId, {
        ...field,
        layout_id: fieldId,
        section_layout_id: layoutId,
      })
    }
  }
  return { sections, fields }
}

function lookupCatalogField(catalogFields, layoutFieldId) {
  const parsed = parseLayoutId(layoutFieldId)
  if (parsed.kind !== 'catalog') return null
  return (catalogFields || []).find((row) => String(row.id) === parsed.value) || null
}

function catalogFieldToSchemaField(row, colSpan) {
  return {
    id: row.id,
    layout_id: catalogId(row.id),
    name: row.name,
    field_type: row.field_type,
    sort_order: row.sort_order,
    is_required: Boolean(row.is_required),
    dropdown_options: row.dropdown_options || [],
    depends_on_parent_id: row.depends_on_parent_id || null,
    depends_on_option: row.depends_on_option || null,
    depends_on_parent_name: row.depends_on_parent_name || null,
    field_source: row.field_source || 'asset',
    colSpan: normalizeColSpan(colSpan, 25),
    catalog: true,
  }
}

/**
 * Apply a saved per-module layout onto a default schema.
 * layout == null returns the default schema unchanged (existing org behavior).
 */
export function applyFormLayout(defaultSchema, layout, { catalogFields = [] } = {}) {
  if (!layout || !Array.isArray(layout.sections) || !Array.isArray(layout.fields)) {
    return defaultSchema
  }

  const indexed = indexSchema(defaultSchema || { sections: [] })
  const layoutSections = sortLayoutItems(layout.sections)
  const layoutFields = sortLayoutItems(layout.fields)
  const fieldsBySection = new Map()

  for (const item of layoutFields) {
    const layoutId = fieldLayoutId(item)
    let source = indexed.fields.get(layoutId)
    if (!source) {
      const catalogRow = lookupCatalogField(catalogFields, layoutId)
      if (catalogRow?.kind === 'parent') {
        source = catalogFieldToSchemaField(catalogRow, item.colSpan)
      }
    }
    if (!source) continue
    const sectionId = fieldLayoutId({ id: item.sectionId })
    if (!fieldsBySection.has(sectionId)) fieldsBySection.set(sectionId, [])
    fieldsBySection.get(sectionId).push({
      ...source,
      colSpan: normalizeColSpan(item.colSpan, source.colSpan || 25),
      sort_order: item.order ?? 0,
    })
  }

  const sections = []
  layoutSections.forEach((item, index) => {
    const layoutId = fieldLayoutId(item)
    const source = indexed.sections.get(layoutId)
    const fields = fieldsBySection.get(layoutId) || []
    if (!fields.length && !source) return
    if (!fields.length && isSystemId(layoutId) && source?.compound) {
      sections.push({
        ...source,
        layout_id: layoutId,
        sort_order: item.order ?? index,
        fields,
      })
      return
    }
    if (!fields.length) return

    let name = source?.name || item.label
    if (!name) {
      const catalogRow = lookupCatalogField(catalogFields, layoutId)
      name = catalogRow?.name || source?.label
    }

    sections.push({
      ...(source || {}),
      id: source?.id || parseLayoutId(layoutId).value,
      layout_id: layoutId,
      name: name || source?.label || 'Section',
      sort_order: item.order ?? index,
      is_active: source?.is_active,
      icon_path: source?.icon_path || null,
      icon_signed_url: source?.icon_signed_url || null,
      fields,
    })
  })

  return {
    ...(defaultSchema || {}),
    sections,
    layoutApplied: true,
  }
}

export function visibleSystemKeys(layout) {
  if (!layout) return null
  const keys = new Set()
  for (const field of layout.fields || []) {
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system') keys.add(parsed.value)
  }
  return keys
}

export function systemFieldColSpan(layout, key, fallback = 1) {
  if (!layout) return fallback
  const match = (layout.fields || []).find((field) => parseLayoutId(field.id).value === key)
  if (!match) return fallback
  return normalizeColSpan(match.colSpan, fallback)
}
