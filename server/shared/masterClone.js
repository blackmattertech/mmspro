/**
 * Duplicate → prefilled create configs for master list tables.
 * Used by client modals/tabs and server create routes so both sides compare the same fields.
 */
import { assertCloneChanged, buildCloneDraft } from './recordClone.js'

const text = (value) => (value == null ? '' : String(value).trim())
const upper = (value) => text(value).toUpperCase()
const lower = (value) => text(value).toLowerCase()
const bool = (value) => value === true || value === 'true'
const phone = (value) => text(value).replace(/[^\d+]/g, '')
const emailList = (value) => {
  const list = Array.isArray(value) ? value : []
  const normalized = list
    .map((item) => lower(typeof item === 'string' ? item : item?.email))
    .filter(Boolean)
  return [...new Set(normalized)].sort().join(',')
}

/**
 * Per-entity form fields compared for duplicate checks (editable form fields only).
 * Location `is_primary` is intentionally excluded and not copied onto duplicates
 * (saving a duplicate must never steal the primary flag).
 */
const SPECS = {
  location: {
    name: text,
    code: upper,
    address_line1: text,
    address_line2: text,
    city: text,
    state: text,
    postal_code: text,
    country: text,
  },
  department: {
    name: text,
    code: upper,
    description: text,
    parent_id: text,
    all_locations: bool,
    location_id: text,
  },
  employee: {
    emp_id: upper,
    name: text,
    mobile: phone,
    email: lower,
    additional_emails: emailList,
    location_id: text,
    department_id: text,
    manager_id: text,
    access_role_id: text,
    login_required: bool,
  },
  area: {
    name: text,
    code: upper,
    location_id: text,
    department_id: text,
  },
  work_center: {
    name: text,
    code: upper,
    description: text,
    location_id: text,
  },
  uom: {
    code: upper,
    name: text,
    category: text,
  },
  vendor: {
    vendor_code: upper,
    name: text,
    contact_person: text,
    mobile: phone,
    email: lower,
    address_line1: text,
    address_line2: text,
    pincode: text,
    city: text,
    state: text,
    gstin: upper,
    pan: upper,
    bank_account_number: text,
    bank_name: text,
    account_name: text,
    ifsc_code: upper,
    branch: text,
  },
}

/** Unique business keys (all must be unchanged to block as a duplicate key). */
const UNIQUE_KEYS = {
  location: ['code'],
  department: ['code'],
  employee: ['emp_id', 'email'],
  area: ['code'],
  work_center: ['code'],
  uom: ['code'],
  vendor: ['vendor_code'],
}

/** Source fields to drop when pre-filling a duplicate draft (besides identity/audit keys). */
const DRAFT_OMIT = {
  location: ['head_employee_id', 'head', 'location_head', 'is_primary', 'org_locations'],
  department: ['org_locations', 'parent', 'headcount', 'employee_count'],
  employee: [
    'photo_url',
    'photo_signed_url',
    'access_role',
    'department',
    'location',
    'manager',
    'org_departments',
    'departments',
    'org_locations',
    'is_location_head',
    'location_head_for',
  ],
  area: ['org_locations', 'departments'],
  work_center: ['org_locations'],
  uom: [],
  vendor: [],
}

export const MASTER_CLONE_KINDS = Object.keys(SPECS)

export function masterCloneCompareKeys(kind) {
  return Object.keys(SPECS[kind] || {})
}

/** Normalize a DB row or request body for the given master kind. */
export function toMasterCloneComparable(kind, record) {
  const spec = SPECS[kind]
  const out = {}
  for (const [key, normalize] of Object.entries(spec || {})) {
    let value = record?.[key]
    if (kind === 'employee' && key === 'additional_emails' && value === undefined) {
      value = record?.org_employee_emails
    }
    out[key] = normalize(value)
  }
  return out
}

/**
 * Only treat a unique key as binding when the source actually has a value
 * (optional codes on areas / work centers may be blank).
 */
export function resolveMasterCloneUniqueKeys(kind, source) {
  const comparable = toMasterCloneComparable(kind, source)
  return (UNIQUE_KEYS[kind] || []).filter((key) => comparable[key] !== '' && comparable[key] != null)
}

/** Returns assertCloneChanged result for a master record. */
export function assertMasterCloneChanged(kind, source, next) {
  return assertCloneChanged({
    source: toMasterCloneComparable(kind, source),
    next: toMasterCloneComparable(kind, next),
    uniqueKeys: resolveMasterCloneUniqueKeys(kind, source),
    compareKeys: masterCloneCompareKeys(kind),
  })
}

/** Build the prefilled (id-less) draft opened in the create modal. */
export function buildMasterCloneDraft(kind, row, { omit = [], map, defaults = {} } = {}) {
  return buildCloneDraft(row, {
    omit: [...(DRAFT_OMIT[kind] || []), ...omit],
    map,
    defaults: { clone_of_id: row?.id, ...defaults },
  })
}

// ---------------------------------------------------------------------------
// Equipment (dynamic field values — `code` is derived from the hierarchy fields)
// ---------------------------------------------------------------------------

export const EQUIPMENT_CLONE_UNIQUE_KEYS = ['code']
export const EQUIPMENT_CLONE_COMPARE_KEYS = [
  'code',
  'location_id',
  'department_id',
  'reading_required',
  'values',
]

/** Never carried over to a duplicate (identity, QR, image, meter history, activity). */
export const EQUIPMENT_CLONE_OMIT = [
  'qr_code',
  'image_path',
  'image_signed_url',
  'activity',
  'values',
  'code',
  'last_meter_reading',
  'last_meter_reading_at',
  'meter_reading_offset',
  'last_meter_logged_by',
  'last_meter_logged_by_name',
  'last_meter_logged_by_department',
  'last_meter_logged_by_designation',
  'last_meter_logger',
  'org_locations',
  'departments',
  'areas',
]

export function equipmentValueText(item) {
  if (!item) return ''
  if (Array.isArray(item.value_json?.values)) {
    return item.value_json.values.map((value) => text(value)).filter(Boolean).join(', ')
  }
  return text(item.value_text)
}

function valuesSignature(items, fieldIds) {
  const allowed = fieldIds ? new Set(fieldIds) : null
  return (items || [])
    .filter((item) => item?.field_id && (!allowed || allowed.has(item.field_id)))
    .map((item) => `${item.field_id}=${equipmentValueText(item)}`)
    .filter((entry) => !entry.endsWith('='))
    .sort()
    .join('\n')
}

/**
 * @param {object} record DB detail row or create payload
 * @param {{ code?: string, fieldIds?: string[] }} options
 *   code: derived asset code; fieldIds: restrict comparison to submitted catalog fields.
 */
export function toEquipmentCloneComparable(record, { code, fieldIds } = {}) {
  const items = record?.values ?? record?.field_values ?? []
  return {
    code: upper(code !== undefined ? code : record?.code),
    location_id: text(record?.location_id),
    department_id: text(record?.department_id),
    reading_required: bool(record?.reading_required),
    values: valuesSignature(items, fieldIds),
  }
}

export function assertEquipmentCloneChanged({ source, payload, sourceCode, nextCode }) {
  const fieldIds = (payload?.values || []).map((item) => item?.field_id).filter(Boolean)
  const uniqueKeys = upper(sourceCode !== undefined ? sourceCode : source?.code) ? EQUIPMENT_CLONE_UNIQUE_KEYS : []
  return assertCloneChanged({
    source: toEquipmentCloneComparable(source, { code: sourceCode, fieldIds }),
    next: toEquipmentCloneComparable(payload, { code: nextCode, fieldIds }),
    uniqueKeys,
    compareKeys: EQUIPMENT_CLONE_COMPARE_KEYS,
  })
}
