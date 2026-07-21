import {
  collectFieldsToClearOnChange,
  filterVisibleFields,
  flattenSchemaFields,
  parseDependsOnOptions,
} from './assetFieldDependencies'

function optionMatchesBreakdown(option) {
  return String(option || '').trim().toLowerCase() === 'breakdown'
}

/** Parent field + option value used on the manual work order form (e.g. Issue Type = Breakdown). */
export function resolveBreakdownDependency(schema) {
  const allFields = flattenSchemaFields(schema)
  for (const field of allFields) {
    const options = parseDependsOnOptions(field.depends_on_option)
    const breakdownOption = options.find(optionMatchesBreakdown)
    if (field.depends_on_parent_id && breakdownOption) {
      const parent = allFields.find((f) => f.id === field.depends_on_parent_id) || null
      return {
        parentFieldId: field.depends_on_parent_id,
        parentFieldName: parent?.name || null,
        breakdownOption,
      }
    }
  }
  return null
}

export function breakdownContextValues(isBreakdown, userValues, dependency) {
  if (!isBreakdown || !dependency) return { ...(userValues || {}) }
  return {
    ...(userValues || {}),
    [dependency.parentFieldId]: dependency.breakdownOption,
  }
}

/** Fields that only appear when breakdown is Yes (same as WO form when parent = Breakdown). */
export function getBreakdownFieldsToRender(schema, isBreakdown, userValues) {
  if (!isBreakdown || !schema?.sections?.length) return []

  const dependency = resolveBreakdownDependency(schema)
  if (!dependency) return []

  const allFields = flattenSchemaFields(schema)
  const baseValues = { ...(userValues || {}) }
  const withBreakdown = breakdownContextValues(true, userValues, dependency)

  const visibleWithout = filterVisibleFields(allFields, baseValues)
  const visibleWith = filterVisibleFields(allFields, withBreakdown)
  const withoutIds = new Set(visibleWithout.map((f) => f.id))

  return visibleWith
    .filter((field) => field.id !== dependency.parentFieldId && !withoutIds.has(field.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
}

export function clearBreakdownFieldValues(schema, values) {
  const dependency = resolveBreakdownDependency(schema)
  if (!dependency) return values

  const fields = getBreakdownFieldsToRender(schema, true, values)
  const next = { ...(values || {}) }
  for (const field of fields) {
    delete next[field.id]
  }
  return next
}

export function applyBreakdownFieldChange(fieldId, nextValue, schema, values) {
  const allFields = flattenSchemaFields(schema)
  const next = { ...values, [fieldId]: nextValue }
  const toClear = collectFieldsToClearOnChange(fieldId, allFields, next)
  for (const id of toClear) {
    delete next[id]
  }
  return next
}

function isEmptyFieldValue(field, value) {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (field.field_type === 'checkbox' && typeof value === 'boolean') return !value
  return String(value).trim() === ''
}

export function missingRequiredBreakdownFields(schema, isBreakdown, userValues) {
  const fields = getBreakdownFieldsToRender(schema, isBreakdown, userValues)
  return fields
    .filter((field) => field.is_required && isEmptyFieldValue(field, userValues?.[field.id]))
    .map((field) => field.name)
}
