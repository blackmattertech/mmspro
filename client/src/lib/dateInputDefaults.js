/** Local calendar date as `YYYY-MM-DD` for `<input type="date">`. */
export function todayDateValue(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local datetime as `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function nowDateTimeLocalValue(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

export function defaultValueForFieldType(fieldType) {
  if (fieldType === 'date') return todayDateValue()
  if (fieldType === 'datetime') return nowDateTimeLocalValue()
  return undefined
}

/** Fill empty date / datetime field values with today (does not overwrite existing). */
export function seedDateFieldDefaults(fields, existing = {}) {
  let changed = false
  const next = { ...existing }
  for (const field of fields || []) {
    const def = defaultValueForFieldType(field.field_type)
    if (def === undefined) continue
    const current = next[field.id]
    if (current !== null && current !== undefined && String(current).trim() !== '') continue
    next[field.id] = def
    changed = true
  }
  return changed ? next : existing
}
