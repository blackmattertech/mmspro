/** Superadmin asset levels, ordered from the first level through each next level. */
export function orderedHierarchyFields(fields) {
  const parents = (fields || []).filter((field) => (
    field
    && field.kind !== 'section'
    && field.kind !== 'child'
    && field.is_active !== false
    && field.id
  ))
  const byId = new Map(parents.map((field) => [field.id, field]))
  const childrenOf = new Map()
  const roots = []
  for (const field of parents) {
    const parentId = field.depends_on_parent_id
    if (parentId && byId.has(parentId)) {
      const list = childrenOf.get(parentId) || []
      list.push(field)
      childrenOf.set(parentId, list)
    } else {
      roots.push(field)
    }
  }
  const sortFields = (left, right) => (
    (left.sort_order ?? 0) - (right.sort_order ?? 0)
    || String(left.name || '').localeCompare(String(right.name || ''))
  )
  roots.sort(sortFields)
  for (const list of childrenOf.values()) list.sort(sortFields)

  const ordered = []
  const walk = (field) => {
    ordered.push(field)
    for (const child of childrenOf.get(field.id) || []) walk(child)
  }
  for (const root of roots) walk(root)
  return ordered
}

/** Area → Equipment Type → Equipment Code, using the names the superadmin typed. */
export function hierarchyChainLabel(field, fields) {
  if (!field) return ''
  const byId = new Map((fields || []).map((item) => [item.id, item]))
  const names = []
  const seen = new Set()
  let current = field
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.unshift(current.name)
    current = current.depends_on_parent_id ? byId.get(current.depends_on_parent_id) : null
  }
  return names.filter(Boolean).join(' → ')
}

export function previousLevelChoices(fields, fieldId) {
  const blocked = new Set(fieldId ? [fieldId] : [])
  if (fieldId) {
    const queue = [fieldId]
    while (queue.length) {
      const id = queue.shift()
      for (const field of fields || []) {
        if (field.depends_on_parent_id !== id || blocked.has(field.id)) continue
        blocked.add(field.id)
        queue.push(field.id)
      }
    }
  }
  return orderedHierarchyFields(fields).filter((field) => !blocked.has(field.id))
}

export function optionsForHierarchyField(field, values) {
  const configured = (field?.dropdown_options || []).map((option) => String(option).trim()).filter(Boolean)
  if (!field?.depends_on_parent_id) return configured
  const parentValue = String(values?.[field.depends_on_parent_id] ?? '').trim()
  if (!parentValue) return []
  const bindings = field.option_bindings || []
  const tagged = bindings.filter((binding) => String(binding?.parent_value || '').trim())
  if (!tagged.length) return configured
  const wanted = parentValue.toLowerCase()
  return bindings
    .filter((binding) => {
      const parent = String(binding?.parent_value || '').trim()
      return !parent || parent.toLowerCase() === wanted
    })
    .map((binding) => String(binding.value || '').trim())
    .filter(Boolean)
}

export function hierarchyFieldDisabled(field, values) {
  if (!field?.depends_on_parent_id) return false
  return !String(values?.[field.depends_on_parent_id] ?? '').trim()
}

export function clearHierarchyDescendants(fieldId, fields, values) {
  const next = { ...values }
  const childrenOf = new Map()
  for (const field of fields || []) {
    if (!field?.depends_on_parent_id) continue
    const list = childrenOf.get(field.depends_on_parent_id) || []
    list.push(field.id)
    childrenOf.set(field.depends_on_parent_id, list)
  }
  const queue = [fieldId]
  const seen = new Set()
  while (queue.length) {
    const id = queue.shift()
    for (const childId of childrenOf.get(id) || []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      delete next[childId]
      queue.push(childId)
    }
  }
  return next
}

export function applyHierarchyFieldChange(fieldId, nextValue, values, fields) {
  const next = clearHierarchyDescendants(fieldId, fields, { ...values, [fieldId]: nextValue })
  if (nextValue == null || nextValue === '' || (Array.isArray(nextValue) && !nextValue.length)) {
    delete next[fieldId]
  }
  return next
}

function levelText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  return String(value ?? '').trim()
}

function rowLevelText(row, fieldId) {
  if (!row || !fieldId) return ''
  const raw = row.values?.[fieldId]
  if (raw != null && raw !== '') return levelText(raw)
  if (!Array.isArray(row.field_values)) return ''
  const match = row.field_values.find((item) => item?.field_id === fieldId)
  if (!match) return ''
  if (match.value_text) return String(match.value_text).trim()
  return levelText(match.value_json?.values)
}

/** A level stays hidden until every level above it has a value. */
export function hierarchyLevelRevealed(field, fields, values) {
  if (!field?.depends_on_parent_id) return true
  const byId = new Map((fields || []).filter((item) => item?.id).map((item) => [item.id, item]))
  if (!byId.has(field.depends_on_parent_id)) return true
  const seen = new Set()
  let parentId = field.depends_on_parent_id
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    if (!byId.has(parentId)) return true
    if (!levelText(values?.[parentId])) return false
    parentId = byId.get(parentId)?.depends_on_parent_id || null
  }
  return true
}

function ancestorIds(field, fields) {
  const byId = new Map((fields || []).filter((item) => item?.id).map((item) => [item.id, item]))
  const ids = []
  const seen = new Set()
  let parentId = field?.depends_on_parent_id
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    ids.push(parentId)
    parentId = byId.get(parentId)?.depends_on_parent_id || null
  }
  return ids
}

function isHierarchyMediaField(field) {
  return field?.field_type === 'image' || field?.field_type === 'file' || /image/i.test(field?.name || '')
}

/** Distinct values already stored on the department's assets for this level. */
export function pickerOptionsForLevel(field, equipment, values, allFields, { includeCurrent = true } = {}) {
  if (!field?.id) return []
  const ancestors = ancestorIds(field, allFields)
  const pool = (equipment || []).filter((row) => ancestors.every((id) => {
    const selected = levelText(values?.[id])
    if (!selected) return true
    return rowLevelText(row, id).toLowerCase() === selected.toLowerCase()
  }))
  const seen = new Set()
  const out = []
  for (const row of pool) {
    const text = rowLevelText(row, field.id)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  if (includeCurrent) {
    const current = levelText(values?.[field.id])
    if (current && !seen.has(current.toLowerCase())) out.push(current)
  }
  return out.sort((left, right) => left.localeCompare(right))
}

/** Fill each revealed level that has exactly one possible value. */
export function fillUniqueHierarchyValues(fieldValues, equipment, allFields) {
  if (!equipment?.length) return fieldValues
  let next = fieldValues || {}
  let changed = false
  for (const field of orderedHierarchyFields(allFields)) {
    if (isHierarchyMediaField(field)) continue
    if (!hierarchyLevelRevealed(field, allFields, next)) continue
    const options = pickerOptionsForLevel(field, equipment, next, allFields, { includeCurrent: false })
    if (options.length !== 1) continue
    if (levelText(next[field.id]).toLowerCase() === options[0].toLowerCase()) continue
    next = applyHierarchyFieldChange(field.id, options[0], next, allFields)
    changed = true
  }
  return changed ? next : fieldValues
}

const SYNTHETIC_HIERARCHY_IDS = new Set(['area', 'department', 'location'])
const PLACEMENT_STEP_NAMES = new Set(['area', 'department', 'location', 'plant / facility', 'asset'])

/** Saved hierarchy levels, without the old Area / Department / Location rows. */
export function hierarchyDisplaySteps(steps) {
  const seen = new Set()
  const rows = []
  for (const step of steps || []) {
    const id = String(step?.field_id || '')
    const name = String(step?.field_name || '').trim()
    const value = String(step?.value ?? '').trim()
    if (!name || !value) continue
    if (SYNTHETIC_HIERARCHY_IDS.has(id)) continue
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    if (!uuid && PLACEMENT_STEP_NAMES.has(name.toLowerCase())) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ field_id: id || name, field_name: name, value })
  }
  return rows
}
