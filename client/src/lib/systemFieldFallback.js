/**
 * How a built-in field should appear when its section is reused on a form
 * that does not own that field.
 * Keep in sync with server/lib/systemFieldFallback.js.
 */
export const SYSTEM_FIELD_MASTERS = {
  order_from_department_id: 'departments',
  order_to_department_id: 'departments',
  department_id: 'departments',
  location_id: 'locations',
  area_id: 'areas',
  equipment_id: 'equipment',
  vendor_id: 'vendors',
  activity_type_id: 'activity_types',
  checklist_template_id: 'checklists',
  technician_ids: 'employees_multi',
  assignee_ids: 'employees_multi',
  work_center: 'work_centers',
}

/** Hardcoded Work Request request-type list — used on every module. */
export const REQUEST_TYPE_OPTIONS = [
  { value: 'inter_department', label: 'Inter Department' },
  { value: 'intra_department', label: 'Intra Department' },
  { value: 'user_self', label: 'User Self Request' },
]

export const SYSTEM_FIELD_OPTIONS = {
  request_type: REQUEST_TYPE_OPTIONS,
  priority: [
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ],
}

export const LOCKED_ENUM_FIELD_KEYS = new Set(['request_type'])

function parseSystemKey(id) {
  const raw = String(id || '')
  if (!raw.startsWith('system:')) return ''
  return raw.slice('system:'.length)
}

/** True when a layout / catalog field is Request type (options are always hardcoded). */
export function isRequestTypeField(field) {
  if (!field) return false
  const bind = String(field.bindKey || field.bind_key || '').toLowerCase().trim()
  const key = String(field.key || '').toLowerCase().trim()
  const systemKey = parseSystemKey(field.id) || (key === 'request_type' ? key : '')
  if (bind === 'request_type' || key === 'request_type' || systemKey === 'request_type') {
    return true
  }
  const label = String(field.label || field.name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return /^request\s*type$/.test(label)
}

/**
 * Hardcoded request-type options, preserving any existing option rules by value.
 */
export function lockedRequestTypeOptions(existing = []) {
  const byValue = new Map()
  for (const item of Array.isArray(existing) ? existing : []) {
    if (item == null) continue
    if (typeof item === 'string' || typeof item === 'number') {
      byValue.set(String(item), { value: String(item), label: String(item), rules: [] })
      continue
    }
    const value = String(item.value ?? item.id ?? '').trim()
    if (!value) continue
    byValue.set(value, {
      value,
      label: String(item.label ?? value),
      rules: Array.isArray(item.rules) ? item.rules : [],
    })
  }
  return REQUEST_TYPE_OPTIONS.map((opt) => {
    const prev = byValue.get(opt.value)
    return {
      value: opt.value,
      label: opt.label,
      ...(prev?.rules?.length ? { rules: prev.rules } : {}),
    }
  })
}
