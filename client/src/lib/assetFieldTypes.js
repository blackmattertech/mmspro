export const ASSET_FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'image', label: 'Image' },
  { value: 'file', label: 'Files' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
]

export function kindLabel(kind) {
  if (kind === 'section') return 'Section'
  if (kind === 'parent') return 'Parent'
  if (kind === 'child') return 'Child'
  return kind
}

export function fieldTypeLabel(value) {
  return ASSET_FIELD_TYPES.find((t) => t.value === value)?.label || value || '—'
}

export function filterFieldsByView(fields, view) {
  if (view === 'sections') return fields.filter((f) => f.kind === 'section')
  if (view === 'parents') return fields.filter((f) => f.kind === 'parent')
  if (view === 'children') return fields.filter((f) => f.kind === 'child')
  return fields.filter((f) => f.kind !== 'child')
}

export function dropdownValuesLabel(field) {
  if (field.field_type !== 'dropdown' || !field.dropdown_options?.length) return '—'
  return field.dropdown_options.join(', ')
}

function hierarchyParts(field) {
  if (field.kind === 'section') return field.name || ''
  if (field.kind === 'parent') return field.section_name || ''
  return [field.section_name, field.parent_name].filter(Boolean).join(' → ')
}

export function fieldSearchText(field, view = 'all') {
  const parts = [
    field.name,
    kindLabel(field.kind),
    field.section_name,
    field.parent_name,
    fieldTypeLabel(field.field_type),
    hierarchyParts(field),
    dropdownValuesLabel(field),
    field.parent_count != null ? String(field.parent_count) : '',
    field.child_count != null ? String(field.child_count) : '',
    field.depends_on_parent_name,
    field.depends_on_option,
    field.is_active === false ? 'inactive' : 'active',
  ]
  if (view === 'all' && field.field_type === 'dropdown' && field.dropdown_options?.length) {
    parts.push(field.dropdown_options.join(' '))
  }
  return parts.filter((p) => p && p !== '—').join(' ').toLowerCase()
}

export function applyFieldFilters(fields, { view, search, sectionId, parentId }) {
  let result = filterFieldsByView(fields, view)

  if (sectionId) {
    result = result.filter((field) => {
      if (field.kind === 'section') return field.id === sectionId
      return field.section_id === sectionId
    })
  }

  if (parentId) {
    result = result.filter((field) => {
      if (field.kind === 'parent') return field.id === parentId
      return field.parent_id === parentId
    })
  }

  const query = search.trim().toLowerCase()
  if (query) {
    result = result.filter((field) => fieldSearchText(field, view).includes(query))
  }

  return result
}

function parentSortKey(field) {
  if (field.kind === 'parent') return field.name || ''
  return field.parent_name || ''
}

function sortValue(field, sortBy) {
  switch (sortBy) {
    case 'name':
      return field.name || ''
    case 'section':
      return field.section_name || (field.kind === 'section' ? field.name : '') || ''
    case 'parent':
      return parentSortKey(field)
    case 'type':
      return kindLabel(field.kind)
    case 'field_type':
      return fieldTypeLabel(field.field_type)
    case 'hierarchy':
      return hierarchyParts(field)
    case 'parents':
      return field.parent_count ?? 0
    case 'values':
      if (field.field_type === 'dropdown' && field.dropdown_options?.length) {
        return field.dropdown_options.join(', ')
      }
      return field.child_count ?? 0
    case 'active':
      return field.is_active === false ? 0 : 1
    case 'sort_order': {
      const order = String(field.sort_order ?? 0).padStart(6, '0')
      if (field.kind === 'parent' && field.section_name) {
        return `${field.section_name.toLowerCase()}\t${order}`
      }
      return order
    }
    default:
      return field.name || ''
  }
}

function isNumericSort(sortBy) {
  return sortBy === 'parents' || sortBy === 'values' || sortBy === 'active'
}

/** Next display order among siblings (sections or parents in a section). */
export function nextSortOrder(fields, { kind, sectionId = null, excludeId = null } = {}) {
  const siblings = (fields || []).filter((field) => {
    if (field.id === excludeId) return false
    if (field.kind !== kind) return false
    if (kind === 'parent') return field.section_id === sectionId
    return true
  })
  if (!siblings.length) return 0
  return Math.max(...siblings.map((field) => field.sort_order ?? 0)) + 1
}

export function getSortOptionsForView(view) {
  if (view === 'sections') {
    return [
      { value: 'sort_order', label: 'Display order' },
      { value: 'name', label: 'Name' },
      { value: 'parents', label: 'Parents' },
      { value: 'values', label: 'Values' },
      { value: 'active', label: 'Active' },
    ]
  }
  if (view === 'parents') {
    return [
      { value: 'sort_order', label: 'Display order' },
      { value: 'name', label: 'Name' },
      { value: 'section', label: 'Section' },
      { value: 'field_type', label: 'Field type' },
      { value: 'values', label: 'Values' },
      { value: 'active', label: 'Active' },
    ]
  }
  if (view === 'children') {
    return [
      { value: 'name', label: 'Name' },
      { value: 'section', label: 'Section' },
      { value: 'parent', label: 'Parent' },
      { value: 'hierarchy', label: 'Hierarchy' },
      { value: 'active', label: 'Active' },
    ]
  }
  return [
    { value: 'name', label: 'Name' },
    { value: 'type', label: 'Type' },
    { value: 'section', label: 'Section' },
    { value: 'parent', label: 'Parent' },
    { value: 'field_type', label: 'Field type' },
    { value: 'hierarchy', label: 'Hierarchy' },
    { value: 'active', label: 'Active' },
  ]
}

export function defaultSortForView(view) {
  if (view === 'sections' || view === 'parents') {
    return { sortBy: 'sort_order', sortDir: 'asc' }
  }
  return { sortBy: 'parent', sortDir: 'asc' }
}

export function sortAssetFields(fields, { sortBy = 'parent', sortDir = 'asc' } = {}) {
  const dir = sortDir === 'desc' ? -1 : 1
  const numeric = isNumericSort(sortBy)

  return [...fields].sort((a, b) => {
    const av = sortValue(a, sortBy)
    const bv = sortValue(b, sortBy)

    if (numeric) {
      const an = Number(av)
      const bn = Number(bv)
      if (an !== bn) return (an - bn) * dir
    } else {
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      if (as < bs) return -1 * dir
      if (as > bs) return 1 * dir
    }

    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  })
}
