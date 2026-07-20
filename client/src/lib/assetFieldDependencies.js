/** Normalize depends_on_option from DB/API (string, JSON array string, or array). */
export function parseDependsOnOptions(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))]
  }

  const str = String(raw).trim()
  if (!str) return []

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))]
      }
    } catch {
      // fall through to single-value handling
    }
  }

  return [str]
}

/** Persist options: single value as plain text (legacy), multiple as JSON array. */
export function serializeDependsOnOptions(options) {
  const list = parseDependsOnOptions(options)
  if (!list.length) return null
  if (list.length === 1) return list[0]
  return JSON.stringify(list)
}

export function dependencyLabel(field) {
  const options = parseDependsOnOptions(field?.depends_on_option)
  if (!field?.depends_on_parent_id || !options.length) return null
  const parentName = field.depends_on_parent_name || 'another field'
  const sectionPrefix = field.depends_on_section_name
    ? `${field.depends_on_section_name} → `
    : ''
  const optionLabel = options.length === 1
    ? options[0]
    : options.join(' / ')
  return `When ${sectionPrefix}${parentName} = ${optionLabel}`
}

export function isFieldDependencyMet(field, values) {
  const options = parseDependsOnOptions(field?.depends_on_option)
  if (!field?.depends_on_parent_id || !options.length) return true
  const parentValue = values?.[field.depends_on_parent_id]
  if (parentValue === null || parentValue === undefined || parentValue === '') return false
  if (Array.isArray(parentValue)) {
    const selected = parentValue.map((value) => String(value).trim().toLowerCase())
    return options.some((option) => selected.includes(option.trim().toLowerCase()))
  }
  const normalized = String(parentValue).trim().toLowerCase()
  return options.some((option) => option.trim().toLowerCase() === normalized)
}

export function filterVisibleFields(fields, values) {
  return (fields || []).filter((field) => isFieldDependencyMet(field, values))
}

export function collectFieldsToClearOnChange(changedFieldId, fields, nextValues) {
  const toClear = new Set()
  const queue = [changedFieldId]

  while (queue.length) {
    const parentId = queue.shift()
    for (const field of fields || []) {
      if (field.depends_on_parent_id !== parentId) continue
      if (!isFieldDependencyMet(field, nextValues)) {
        if (!toClear.has(field.id)) {
          toClear.add(field.id)
          queue.push(field.id)
        }
      }
    }
  }

  return [...toClear]
}

export function flattenSchemaFields(schema) {
  const fields = []
  for (const section of schema?.sections || []) {
    for (const field of section.fields || []) {
      fields.push(field)
    }
  }
  return fields
}
