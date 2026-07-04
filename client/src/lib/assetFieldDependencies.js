export function dependencyLabel(field) {
  if (!field?.depends_on_parent_id || !field.depends_on_option) return null
  const parentName = field.depends_on_parent_name || 'another field'
  const sectionPrefix = field.depends_on_section_name
    ? `${field.depends_on_section_name} → `
    : ''
  return `When ${sectionPrefix}${parentName} = ${field.depends_on_option}`
}

export function isFieldDependencyMet(field, values) {
  if (!field?.depends_on_parent_id || !field.depends_on_option) return true
  const parentValue = values?.[field.depends_on_parent_id]
  if (parentValue === null || parentValue === undefined || parentValue === '') return false
  return String(parentValue).trim().toLowerCase()
    === String(field.depends_on_option).trim().toLowerCase()
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
