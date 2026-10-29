import { parseLayoutId } from './formLayoutIds'

function sectionTitle(field) {
  return field?.section_name || 'Details'
}

/**
 * Equipment create/edit shows only the parent fields a super admin created.
 * Built-in name, code, location, department, area, and image inputs are not part of this form.
 */
export function buildEquipmentFormSections(fieldDefs, layout) {
  const parents = (fieldDefs || []).filter((field) => (
    field.is_active !== false && (field.kind === 'parent' || field.kind == null)
  ))
  const byId = new Map(parents.map((field) => [field.id, field]))
  const ordered = []
  const seen = new Set()

  const layoutFields = [...(layout?.fields || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (const field of layoutFields) {
    const parsed = parseLayoutId(field.id)
    if (parsed.kind !== 'catalog') continue
    const def = byId.get(parsed.value)
    if (!def || seen.has(def.id)) continue
    ordered.push({
      ...def,
      is_required: field.required != null ? Boolean(field.required) : Boolean(def.is_required),
    })
    seen.add(def.id)
  }

  for (const field of parents) {
    if (seen.has(field.id)) continue
    ordered.push(field)
  }

  const groups = []
  const map = new Map()
  for (const field of ordered) {
    const key = field.section_id || 'other'
    if (!map.has(key)) {
      const section = { id: key, title: sectionTitle(field), items: [] }
      map.set(key, section)
      groups.push(section)
    }
    map.get(key).items.push({ kind: 'catalog', field })
  }
  return groups
}
