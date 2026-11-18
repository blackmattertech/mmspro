/**
 * Shared clone helpers for Duplicate → prefilled create.
 * Used by both client and server (copied logic; keep in sync via this module when imported,
 * or mirrored in client/server wrappers).
 */

export const CLONE_UNCHANGED_MESSAGE =
  'This is a duplicate of the original record. Change the unique fields and at least one other detail before saving.'

export const CLONE_UNIQUE_KEY_MESSAGE =
  'This is a duplicate of the original record. Change the unique fields and at least one other detail before saving.'

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/** Stable JSON for equality — sorts object keys, normalizes nullish to ''. */
export function normalizeCloneValue(value) {
  if (value == null) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCloneValue(item))
  }
  if (isPlainObject(value)) {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = normalizeCloneValue(value[key])
    }
    return out
  }
  return String(value).trim()
}

export function pickCloneFields(record, fieldKeys = []) {
  const out = {}
  for (const key of fieldKeys) {
    if (!key) continue
    out[key] = record?.[key]
  }
  return out
}

export function normalizeClonePayload(payload, fieldKeys = []) {
  const picked = fieldKeys.length
    ? pickCloneFields(payload, fieldKeys)
    : (payload || {})
  return normalizeCloneValue(picked)
}

export function clonePayloadsEqual(a, b, fieldKeys = []) {
  return JSON.stringify(normalizeClonePayload(a, fieldKeys))
    === JSON.stringify(normalizeClonePayload(b, fieldKeys))
}

export function uniqueKeysUnchanged(source, next, uniqueKeys = []) {
  if (!uniqueKeys.length) return false
  return uniqueKeys.every((key) => {
    const left = normalizeCloneValue(source?.[key])
    const right = normalizeCloneValue(next?.[key])
    if (left === '' && right === '') return true
    return left === right
  })
}

/**
 * 2C: block when unique business key(s) are unchanged OR the full comparable
 * payload still matches. When uniqueKeys are provided, at least one non-key
 * compare field must also change.
 *
 * @returns {{ ok: true } | { ok: false, message: string, reason: 'unique_key' | 'unchanged' }}
 */
export function assertCloneChanged({
  source,
  next,
  uniqueKeys = [],
  compareKeys = [],
} = {}) {
  if (!source || !next) return { ok: true }

  if (uniqueKeys.length && uniqueKeysUnchanged(source, next, uniqueKeys)) {
    return { ok: false, message: CLONE_UNIQUE_KEY_MESSAGE, reason: 'unique_key' }
  }

  const keys = compareKeys.length
    ? compareKeys
    : [...new Set([
      ...Object.keys(source || {}),
      ...Object.keys(next || {}),
      ...uniqueKeys,
    ])].filter((key) => key !== 'id' && key !== 'clone_of_id')

  if (clonePayloadsEqual(source, next, keys)) {
    return { ok: false, message: CLONE_UNCHANGED_MESSAGE, reason: 'unchanged' }
  }

  if (uniqueKeys.length) {
    const otherKeys = keys.filter((key) => !uniqueKeys.includes(key))
    if (otherKeys.length && clonePayloadsEqual(source, next, otherKeys)) {
      return { ok: false, message: CLONE_UNCHANGED_MESSAGE, reason: 'unchanged' }
    }
  }

  return { ok: true }
}

export function stripIdentity(record, omitKeys = []) {
  if (!record || typeof record !== 'object') return {}
  const omit = new Set([
    'id',
    'org_id',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
    'clone_of_id',
    ...omitKeys,
  ])
  const out = {}
  for (const [key, value] of Object.entries(record)) {
    if (omit.has(key)) continue
    out[key] = value
  }
  return out
}

export function buildCloneDraft(record, {
  omit = [],
  map = null,
  defaults = {},
} = {}) {
  const base = stripIdentity(record, omit)
  const mapped = typeof map === 'function' ? map(base, record) : base
  return {
    ...mapped,
    ...defaults,
  }
}

/** Comparable fields for PM plan clone checks (name is the clone business key). */
export const PM_PLAN_CLONE_UNIQUE_KEYS = ['name']
export const PM_PLAN_CLONE_COMPARE_KEYS = [
  'name',
  'department_id',
  'location_id',
  'area_id',
  'equipment_id',
  'activity_type_id',
  'work_center',
  'priority',
  'status',
  'schedule_type',
  'is_recurring',
  'calendar_unit',
  'every_n',
  'weekdays',
  'custom_interval',
  'custom_unit',
  'never_ends',
  'start_date',
  'end_date',
  'grace_days',
  'generate_before_days',
  'last_reading',
  'last_service_date',
  'reading_interval',
  'whichever_comes_first',
  'checklist_template_id',
  'contractor_vendor_id',
  'estimated_labour_hours',
  'estimated_duration_hours',
  'required_tools',
  'required_skills',
  'technician_ids',
]

export class CloneUnchangedError extends Error {
  constructor(message = CLONE_UNCHANGED_MESSAGE) {
    super(message)
    this.name = 'CloneUnchangedError'
    this.status = 400
    this.code = 'CLONE_UNCHANGED'
  }
}

export function throwIfCloneUnchanged(args) {
  const result = assertCloneChanged(args)
  if (!result.ok) throw new CloneUnchangedError(result.message)
  return result
}
