/**
 * Master picker sources Super Admin can drop onto WR / WO / PM / Warranty forms.
 * Keep in sync with client/src/lib/formFieldSources.js.
 */
import { masterId, parseLayoutId } from './formLayoutIds.js'
import { collectActiveRules, isFieldHiddenByRules } from './formOptionRules.js'

export const MASTER_SOURCES = [
  { id: 'locations', label: 'Location', multi: false, nativeColumn: 'location_id' },
  { id: 'departments', label: 'Department', multi: false, nativeColumn: 'department_id' },
  { id: 'employees', label: 'Employee', multi: false, nativeColumn: 'employee_id' },
  { id: 'employees_multi', label: 'Employees', multi: true, nativeColumn: 'technician_ids' },
  { id: 'work_centers', label: 'Work Center', multi: false, nativeColumn: 'work_center_id' },
  { id: 'areas', label: 'Area', multi: false, nativeColumn: 'area_id' },
  { id: 'equipment', label: 'Equipment', multi: false, nativeColumn: 'equipment_id' },
  { id: 'vendors', label: 'Vendor', multi: false, nativeColumn: 'vendor_id' },
  { id: 'checklists', label: 'Checklist', multi: false, nativeColumn: 'checklist_template_id' },
  { id: 'activity_types', label: 'Activity type', multi: false, nativeColumn: 'activity_type_id' },
  { id: 'statuses', label: 'Status', multi: false, nativeColumn: 'status_id' },
]

const MASTER_BY_ID = new Map(MASTER_SOURCES.map((item) => [item.id, item]))

export const FORM_NATIVE_COLUMNS = {
  'work_request.create': new Set(['equipment_id']),
  'work_orders.manual': new Set([]),
  'pm.plan': new Set([
    'location_id',
    'department_id',
    'area_id',
    'equipment_id',
    'activity_type_id',
    'checklist_template_id',
    'technician_ids',
  ]),
  'warranty.warranty': new Set(['vendor_id']),
}

export const FORM_STATUS_ENTITY = {
  'work_request.create': 'work_request',
  'work_orders.manual': 'work_order',
  'pm.plan': 'pm_plan',
  'warranty.warranty': 'work_order',
}

export function getMasterSource(sourceId) {
  return MASTER_BY_ID.get(sourceId) || null
}

/**
 * How a child master can be filtered by a parent master's selected id.
 * Keep in sync with client/src/lib/formFieldSources.js.
 */
export const MASTER_FILTER_LINKS = {
  departments: { locations: 'locationId' },
  areas: { departments: 'departmentId', locations: 'locationId' },
  equipment: { areas: 'areaId', departments: 'departmentId', locations: 'locationId' },
  employees: { departments: 'departmentId', locations: 'locationId' },
  employees_multi: { departments: 'departmentId', locations: 'locationId' },
}

export function masterFilterKey(childSourceId, parentSourceId) {
  return MASTER_FILTER_LINKS[childSourceId]?.[parentSourceId] || null
}

export function canFilterMasterBy(childSourceId, parentSourceId) {
  return Boolean(masterFilterKey(childSourceId, parentSourceId))
}

export function publicMasterSources() {
  return MASTER_SOURCES.map((item) => ({
    id: item.id,
    layoutId: masterId(item.id),
    label: item.label,
    multi: item.multi,
  }))
}

export function nativeColumnFor(formId, sourceId) {
  const source = getMasterSource(sourceId)
  if (!source?.nativeColumn) return null
  const allowed = FORM_NATIVE_COLUMNS[formId]
  if (!allowed?.has(source.nativeColumn)) return null
  return source.nativeColumn
}

export function statusEntityForForm(formId) {
  return FORM_STATUS_ENTITY[formId] || 'work_order'
}

export function valuesByBindKey(layout, values = {}) {
  const out = {}
  for (const field of layout?.fields || []) {
    if (!field.bindKey) continue
    const value = values[field.id]
    if (value == null || value === '') continue
    out[field.bindKey] = value
  }
  return out
}

export function splitBoundValues(formId, values = {}, layout = null) {
  const native = { ...valuesByBindKey(layout, values) }
  const extras = {}
  for (const [key, value] of Object.entries(values)) {
    const parsed = parseLayoutId(key)
    if (parsed.kind === 'master') {
      const column = nativeColumnFor(formId, parsed.value)
      if (column && native[column] == null) native[column] = value
      extras[key] = value
      continue
    }
    extras[key] = value
  }
  return { native, extras }
}

export function isEmptyMasterValue(value) {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.filter(Boolean).length === 0
  return false
}

function layoutDependencyMet(field, values) {
  if (!field?.dependsOnFieldId) return true
  const options = Array.isArray(field.dependsOnOptions)
    ? field.dependsOnOptions.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : []
  if (!options.length) return true
  const parentValue = values?.[field.dependsOnFieldId]
  if (parentValue == null || parentValue === '') return false
  if (Array.isArray(parentValue)) {
    const selected = parentValue.map((item) => String(item).trim().toLowerCase())
    return options.some((option) => selected.includes(option))
  }
  return options.includes(String(parentValue).trim().toLowerCase())
}

export function missingRequiredLayoutValues(layout, { systemValues = {}, masterValues = {}, catalogValues = {} } = {}) {
  if (!layout) return []
  const values = { ...catalogValues, ...masterValues }
  const activeRules = collectActiveRules(layout, values)
  const missing = []
  for (const field of layout.fields || []) {
    if (!field.required) continue
    if (isFieldHiddenByRules(field.id, activeRules)) continue
    if (!layoutDependencyMet(field, values)) continue
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system') {
      const value = systemValues[parsed.value]
      if (isEmptyMasterValue(value)) missing.push(parsed.value)
    } else if (parsed.kind === 'master' || parsed.kind === 'field') {
      const value = masterValues[field.id] ?? masterValues[parsed.value] ?? catalogValues[field.id]
      if (isEmptyMasterValue(value)) {
        missing.push(field.label || getMasterSource(field.masterSource || parsed.value)?.label || parsed.value)
      }
    } else if (parsed.kind === 'catalog') {
      const value = catalogValues[parsed.value] ?? catalogValues[field.id]
      if (isEmptyMasterValue(value)) missing.push(parsed.value)
    }
  }
  return missing
}
