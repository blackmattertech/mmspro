/**
 * Split shared asset sections from equipment-only field rows.
 * Equipment parents/children live in equipment_fields; other asset form fields in asset_fields.
 * Sections are shared and must stay visible even before any parent fields exist.
 */
export function scopeAssetFields(fields, scope) {
  if (!scope || scope === 'all') return fields || []

  const list = fields || []
  const parents = list.filter((f) => f.kind === 'parent')
  const parentIds = new Set(parents.map((p) => p.id))

  if (scope === 'equipment') {
    return list.filter((f) => {
      if (f.kind === 'section') return true
      if (f.kind === 'parent') return true
      if (f.kind === 'child') return parentIds.has(f.parent_id)
      return false
    })
  }

  if (scope === 'assets') {
    return list.filter((f) => {
      if (f.kind === 'section') return true
      if (f.kind === 'child') return parentIds.has(f.parent_id)
      return f.kind !== 'section'
    })
  }

  return list
}
