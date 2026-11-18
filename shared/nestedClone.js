/**
 * Duplicate → prefilled create configs for nested / secondary creatable lists
 * (PM activity types, form dropdown options, task masters, org statuses, roles,
 * support tickets, report schedules).
 *
 * Used by client modals and server create paths so both sides compare the same fields.
 * Mirrors shared/masterClone.js: open create (not edit) with a clone draft + `clone_of_id`,
 * client runs `assertNestedCloneChanged`, server runs `enforceNestedCloneOrThrow`.
 */
import { assertCloneChanged } from './recordClone.js'

const text = (value) => (value == null ? '' : String(value).trim())
const lower = (value) => text(value).toLowerCase()
const upper = (value) => text(value).toUpperCase()
const bool = (value) => value === true || value === 'true'
const num = (value) => {
  if (value == null || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? n : text(value)
}

/** Same rule as server/lib/orgStatusDefaults.js `slugifyStatusKey` (kept in sync by test). */
export function slugifyCloneKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'status'
}

/** Sorted, de-duplicated, lower-cased email list → stable string. */
function emailSignature(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,;]+/)
  return [...new Set(list.map((item) => lower(item)).filter(Boolean))].sort().join(',')
}

/** Role permission rows → stable signature (only granted rights, sorted by module). */
export function permissionsSignature(permissions) {
  if (!Array.isArray(permissions)) return ''
  return permissions
    .filter((row) => row?.module_key)
    .map((row) => {
      const rights = [
        row.can_create ? 'c' : '',
        row.can_read ? 'r' : '',
        row.can_update ? 'u' : '',
        row.can_delete ? 'd' : '',
      ].join('')
      return rights ? `${row.module_key}:${rights}` : ''
    })
    .filter(Boolean)
    .sort()
    .join('|')
}

const SCHEDULE_WEEKDAY_FREQUENCIES = new Set(['weekly', 'biweekly', 'twice_weekly'])
const SCHEDULE_MONTH_FREQUENCIES = new Set(['monthly', 'quarterly', 'half_yearly', 'yearly'])

/**
 * Each kind: `fields` (normalizers for compared fields), `unique` (business keys),
 * `compare` (optional narrower compare list), `draft` (fields copied onto the duplicate).
 */
const SPECS = {
  pm_activity_type: {
    fields: { name: lower, description: text },
    unique: ['name'],
    draft: ['name', 'description'],
  },
  // Dropdown option rows are plain labels; value mirrors the label on save.
  form_option: {
    fields: { label: lower, value: lower },
    unique: ['label'],
    compare: ['label'],
    draft: ['label', 'value'],
  },
  task_status: {
    fields: {
      name: lower,
      color: upper,
      description: text,
      is_active: (value) => value !== false,
      is_terminal: bool,
    },
    unique: ['name'],
    draft: ['name', 'color', 'description', 'is_active', 'is_terminal'],
  },
  task_priority: {
    fields: {
      name: lower,
      color: upper,
      icon: lower,
      description: text,
      is_active: (value) => value !== false,
    },
    unique: ['name'],
    draft: ['name', 'color', 'icon', 'description', 'is_active'],
  },
  // Name is the only meaningful field for categories and tags.
  task_category: {
    fields: { name: lower },
    unique: ['name'],
    draft: ['name', 'is_active'],
  },
  task_tag: {
    fields: { name: lower },
    unique: ['name'],
    draft: ['name', 'is_active'],
  },
  // `key` is derived from the name on create, so both always move together.
  org_status: {
    fields: {
      key: (value) => slugifyCloneKey(value),
      name: lower,
      color: upper,
      description: text,
      is_active: (value) => value !== false,
      is_terminal: bool,
    },
    unique: ['key', 'name'],
    draft: ['name', 'color', 'description', 'is_active', 'is_terminal'],
  },
  role: {
    fields: { name: lower, description: text, permissions: permissionsSignature },
    unique: ['name'],
    draft: ['name', 'description', 'permissions'],
  },
  // Subject is a soft key: not DB-unique, but an unchanged subject marks a blind copy.
  support_ticket: {
    fields: {
      subject: lower,
      category: text,
      priority: lower,
      related_module: text,
      asset_ref: text,
      description: text,
    },
    unique: ['subject'],
    draft: ['subject', 'category', 'priority', 'related_module', 'asset_ref', 'description'],
  },
  // No natural unique key: a duplicate must differ in at least one delivery detail.
  report_schedule: {
    fields: {
      custom_report_id: text,
      emails: emailSignature,
      frequency: lower,
      send_hour: num,
      send_hour_2: num,
      weekday: num,
      weekday_2: num,
      month_day: num,
      date_window: lower,
      email_body_text: text,
    },
    unique: [],
    draft: [
      'custom_report_id',
      'emails',
      'frequency',
      'send_hour',
      'send_hour_2',
      'weekday',
      'weekday_2',
      'month_day',
      'date_window',
      'is_active',
      'email_body_text',
    ],
  },
}

export const NESTED_CLONE_KINDS = Object.keys(SPECS)

export function nestedCloneCompareKeys(kind) {
  const spec = SPECS[kind]
  if (!spec) return []
  return spec.compare || Object.keys(spec.fields)
}

/** Normalize a DB row, request body, or client form for the given kind. */
export function toNestedCloneComparable(kind, record) {
  const spec = SPECS[kind]
  const out = {}
  for (const [key, normalize] of Object.entries(spec?.fields || {})) {
    let value = record?.[key]
    if (kind === 'org_status' && key === 'key') value = record?.name
    out[key] = normalize(value)
  }

  if (kind === 'report_schedule') {
    // Frequency-dependent fields only matter for the frequencies that use them.
    const frequency = out.frequency || 'weekly'
    if (frequency !== 'twice_daily') out.send_hour_2 = ''
    if (!SCHEDULE_WEEKDAY_FREQUENCIES.has(frequency)) out.weekday = ''
    if (frequency !== 'twice_weekly') out.weekday_2 = ''
    if (!SCHEDULE_MONTH_FREQUENCIES.has(frequency)) out.month_day = ''
  }
  return out
}

/** Unique keys only bind when the source actually has a value for them. */
export function resolveNestedCloneUniqueKeys(kind, source) {
  const comparable = toNestedCloneComparable(kind, source)
  return (SPECS[kind]?.unique || []).filter((key) => comparable[key] !== '' && comparable[key] != null)
}

/** Returns assertCloneChanged result for a nested record. */
export function assertNestedCloneChanged(kind, source, next) {
  return assertCloneChanged({
    source: toNestedCloneComparable(kind, source),
    next: toNestedCloneComparable(kind, next),
    uniqueKeys: resolveNestedCloneUniqueKeys(kind, source),
    compareKeys: nestedCloneCompareKeys(kind),
  })
}

/**
 * Build the prefilled (id-less) draft opened in the create form.
 * Whitelisted per kind so identity, numbering, status and audit fields never carry over.
 */
export function buildNestedCloneDraft(kind, row, { defaults = {}, map } = {}) {
  const spec = SPECS[kind]
  const draft = {}
  for (const key of spec?.draft || []) {
    if (row?.[key] !== undefined) draft[key] = row[key]
  }
  if (kind === 'role' && Array.isArray(row?.permissions)) {
    draft.permissions = row.permissions.map((item) => ({ ...item }))
  }
  if (kind === 'report_schedule') {
    draft.custom_report_id = row?.custom_report_id || row?.custom_report?.id || ''
    if (Array.isArray(row?.emails)) draft.emails = [...row.emails]
  }
  const mapped = typeof map === 'function' ? map(draft, row) : draft
  return {
    ...mapped,
    clone_of_id: row?.id,
    ...defaults,
  }
}

/**
 * Dropdown options must stay unique within their field (case-insensitive, trimmed).
 * Returns the first repeated label, or null when every label is unique.
 */
export function findDuplicateOptionLabel(labels = []) {
  const seen = new Set()
  for (const raw of labels) {
    const label = text(raw)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) return label
    seen.add(key)
  }
  return null
}
