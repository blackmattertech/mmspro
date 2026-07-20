/** Build work-order-style form schema from asset field rows. */
export function buildAssetFormSchema(fields, sectionOrderIds, { activeOnly = false } = {}) {
  const byId = new Map((fields || []).map((field) => [field.id, field]))
  const order = sectionOrderIds?.length
    ? sectionOrderIds
    : (fields || [])
      .filter((f) => f.kind === 'section')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map((f) => f.id)

  const sections = order
    .map((id) => byId.get(id))
    .filter(Boolean)
    .filter((section) => section.kind === 'section')
    .filter((section) => !activeOnly || section.is_active !== false)
    .map((section) => {
      const parents = (fields || [])
        .filter((f) => f.kind === 'parent' && f.section_id === section.id)
        .filter((f) => !activeOnly || f.is_active !== false)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
        .map((parent) => ({
          id: parent.id,
          name: parent.name,
          field_type: parent.field_type,
          sort_order: parent.sort_order,
          is_required: Boolean(parent.is_required),
          dropdown_options: parent.dropdown_options || [],
          depends_on_parent_id: parent.depends_on_parent_id,
          depends_on_option: parent.depends_on_option,
          depends_on_parent_name: parent.depends_on_parent_name,
        }))

      return {
        id: section.id,
        name: section.name,
        sort_order: section.sort_order,
        is_active: section.is_active,
        icon_path: section.icon_path || null,
        icon_signed_url: section.icon_signed_url || null,
        fields: parents,
      }
    })

  return { sections }
}

export function reorderItemsById(items, fromId, toIndex) {
  const fromIndex = items.findIndex((item) => item.id === fromId)
  if (fromIndex === -1) return items

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  const clamped = Math.max(0, Math.min(toIndex, next.length))
  next.splice(clamped, 0, moved)
  return next
}
