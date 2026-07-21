/**
 * Split shared asset sections from equipment-only field rows.
 * Equipment parents/children live in equipment_fields; other asset form fields in asset_fields.
 */
export function scopeAssetFields(fields, scope) {
  if (!scope || scope === 'all') return fields || []

  const list = fields || []
  const parents = list.filter((f) => f.kind === 'parent')
  const parentIds = new Set(parents.map((p) => p.id))

  if (scope === 'equipment') {
    const sectionIds = new Set(parents.map((p) => p.section_id).filter(Boolean))
    return list.filter((f) => {
      if (f.kind === 'section') return sectionIds.has(f.id)
      if (f.kind === 'parent') return true
      if (f.kind === 'child') return parentIds.has(f.parent_id)
      return false
    })
  }

  if (scope === 'assets') {
    const sectionIdsWithParents = new Set(parents.map((p) => p.section_id).filter(Boolean))
    return list.filter((f) => {
      if (f.kind === 'section') return sectionIdsWithParents.has(f.id)
      if (f.kind === 'child') return parentIds.has(f.parent_id)
      return f.kind !== 'section'
    })
  }

  return list
}
