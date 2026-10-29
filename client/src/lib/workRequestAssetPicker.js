import {
  collectFieldsToClearOnChange,
  filterVisibleFields,
  isFieldDependencyMet,
} from './assetFieldDependencies'

const EQUIPMENT_CASCADE_ROLES = new Set([
  'equipmentType',
  'equipmentName',
  'equipmentTag',
  'equipmentCode',
  'capacity',
])

export function isEquipmentCascadeRole(role) {
  return EQUIPMENT_CASCADE_ROLES.has(role)
}

export function getEquipmentFieldRole(field) {
  if (!field?.name) return 'other'
  const n = field.name.trim().toLowerCase()
  if ((n === 'equipment' || n === 'asset') && field.field_type === 'dropdown') return 'redundant'
  if (n === 'area' || n === 'equipment area' || n === 'asset area') return 'area'
  if (n.includes('equipment type') || n.includes('asset type')) return 'equipmentType'
  if (isNameField(field) || n.includes('equipment name') || n.includes('asset name')) return 'equipmentName'
  if (n.includes('equipment tag') || n.includes('asset tag')) return 'equipmentTag'
  if (n.includes('equipment code') || n.includes('asset code') || (isCodeField(field) && (n.includes('equipment') || n.includes('asset')))) {
    return 'equipmentCode'
  }
  if (n.includes('capacity')) return 'capacity'
  return 'other'
}

const WORK_REQUEST_FIELD_ORDER = {
  area: 0,
  equipmentType: 1,
  equipmentName: 2,
  equipmentTag: 3,
  equipmentCode: 4,
  capacity: 5,
  other: 50,
  redundant: 99,
}

export function sortFieldsForWorkRequestPicker(fields) {
  return [...(fields || [])].sort((a, b) => {
    const ra = WORK_REQUEST_FIELD_ORDER[getEquipmentFieldRole(a)] ?? 50
    const rb = WORK_REQUEST_FIELD_ORDER[getEquipmentFieldRole(b)] ?? 50
    if (ra !== rb) return ra - rb
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  })
}

export function fieldsForWorkRequestSection(fields) {
  const seenRoles = new Set()
  const seenNames = new Set()
  return sortFieldsForWorkRequestPicker(fields).filter((field) => {
    const role = getEquipmentFieldRole(field)
    if (role === 'redundant' || role === 'equipmentCode') return false
    const name = String(field.name || '').trim().toLowerCase()
    if (name && seenNames.has(name)) return false
    if (role !== 'other' && seenRoles.has(role)) return false
    if (name) seenNames.add(name)
    if (role !== 'other') seenRoles.add(role)
    return true
  })
}

export function distinctAreasFromEquipment(equipment) {
  const byName = new Map()
  for (const row of equipment || []) {
    const name = String(row.area_name || row.areas?.name || '').trim()
    if (!row.area_id || !name) continue
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { id: row.area_id, name, ids: [row.area_id] })
      continue
    }
    if (!existing.ids.includes(row.area_id)) existing.ids.push(row.area_id)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function filterEquipmentByArea(equipment, areaId) {
  if (!areaId) return equipment || []
  const selected = (equipment || []).find((row) => row.area_id === areaId)
  const name = String(selected?.area_name || selected?.areas?.name || '').trim().toLowerCase()
  return (equipment || []).filter((row) => {
    if (row.area_id === areaId) return true
    if (!name) return false
    return String(row.area_name || row.areas?.name || '').trim().toLowerCase() === name
  })
}

export function capacityOptionsForSelection(equipment, fieldValues, allFields, capacityField) {
  if (!capacityField) return []
  const matches = filterEquipmentByValues(equipment, fieldValues, { allFields })
  return distinctFieldValues(matches, capacityField.id, allFields)
}

export function resolveUniqueEquipmentId(equipment, fieldValues, allFields) {
  const matches = filterEquipmentByValues(equipment, fieldValues, { allFields })
  if (matches.length === 1) return matches[0].id
  return null
}

export function flattenAssetSections(sections) {
  const fields = []
  for (const section of sections || []) {
    for (const field of section.fields || []) {
      fields.push(field)
    }
  }
  return fields
}

function normalizeValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).join(', ')
  return String(value).trim()
}

function isCodeField(field) {
  return /(^|[^a-z])code([^a-z]|$)/i.test(String(field?.name || ''))
}

function isNameField(field) {
  return /(^|[^a-z])name([^a-z]|$)/i.test(String(field?.name || ''))
}

/** Value for a master field on an equipment catalog row (includes name/code columns). */
export function equipmentFieldValue(row, field) {
  if (!row || !field) return ''
  const fromValues = normalizeValue(row.values?.[field.id])
  if (fromValues) return fromValues
  if (isNameField(field) && row.name) return String(row.name).trim()
  if (isCodeField(field) && row.code) return String(row.code).trim()
  return ''
}

/** Build form field values from a selected equipment row. */
export function fieldValuesFromEquipment(row, allFields) {
  if (!row) return {}
  const next = {}
  for (const field of allFields || []) {
    const value = equipmentFieldValue(row, field)
    if (value) next[field.id] = value
  }
  return next
}

export const BLANK_EQUIPMENT_TYPE = '__blank__'

function valueMatches(selected, equipmentValue) {
  const a = normalizeValue(selected).toLowerCase()
  const b = normalizeValue(equipmentValue).toLowerCase()
  if (a === BLANK_EQUIPMENT_TYPE) return !b
  if (!a) return true
  return a === b
}

export function equipmentTypeChoices(equipment, typeField, allFields) {
  if (!typeField) return []
  const values = distinctFieldValues(equipment, typeField.id, allFields)
  return [
    { value: BLANK_EQUIPMENT_TYPE, label: 'Blank' },
    ...values.map((value) => ({ value, label: value })),
  ]
}

/** Equipment rows matching all filled hierarchy field values. */
export function filterEquipmentByValues(equipment, fieldValues, { excludeFieldId = null, allFields = null } = {}) {
  const fieldById = new Map((allFields || []).map((f) => [f.id, f]))
  return (equipment || []).filter((row) => {
    for (const [fieldId, selected] of Object.entries(fieldValues || {})) {
      if (fieldId === excludeFieldId) continue
      const normalized = normalizeValue(selected)
      if (!normalized) continue
      const field = fieldById.get(fieldId)
      const equipmentValue = field
        ? equipmentFieldValue(row, field)
        : normalizeValue(row.values?.[fieldId])
      if (!valueMatches(selected, equipmentValue)) return false
    }
    return true
  })
}

export function distinctFieldValues(equipment, fieldId, allFields = null) {
  const field = (allFields || []).find((f) => f.id === fieldId) || null
  const seen = new Set()
  const out = []
  for (const row of equipment || []) {
    const text = field
      ? equipmentFieldValue(row, field)
      : normalizeValue(row.values?.[fieldId])
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function cascadeFieldValues(fieldValues, allFields, excludeFieldId) {
  const next = {}
  for (const field of allFields || []) {
    if (field.id === excludeFieldId) continue
    if (!isEquipmentCascadeRole(getEquipmentFieldRole(field))) continue
    const selected = fieldValues?.[field.id]
    if (!normalizeValue(selected)) continue
    next[field.id] = selected
  }
  return next
}

export function equipmentMatchingSelectors(equipment, fieldValues, allFields, excludeFieldId = null) {
  return filterEquipmentByValues(
    equipment,
    cascadeFieldValues(fieldValues, allFields, excludeFieldId),
    { allFields },
  )
}

export function optionsForAssetField(field, equipment, fieldValues, allFields) {
  const pool = equipmentMatchingSelectors(equipment, fieldValues, allFields, field.id)
  const fromData = distinctFieldValues(pool, field.id, allFields)

  if (fromData.length) {
    const configured = (field.dropdown_options || []).map((opt) => String(opt).trim()).filter(Boolean)
    if (!configured.length) return fromData
    const allowed = new Set(fromData.map((value) => value.toLowerCase()))
    const ordered = configured.filter((opt) => allowed.has(opt.toLowerCase()))
    const seen = new Set(ordered.map((opt) => opt.toLowerCase()))
    const extras = fromData.filter((value) => !seen.has(value.toLowerCase()))
    return [...ordered, ...extras]
  }

  if (isEquipmentCascadeRole(getEquipmentFieldRole(field))) {
    return []
  }

  if (field.dropdown_options?.length) {
    return field.dropdown_options
  }

  return []
}

export function applyAssetFieldChange(fieldId, nextValue, fieldValues, allFields) {
  const next = { ...fieldValues, [fieldId]: nextValue }
  const toClear = collectFieldsToClearOnChange(fieldId, allFields, next)
  for (const id of toClear) {
    delete next[id]
  }
  return next
}

export function resolveEquipmentFromSelection(equipment, fieldValues, allFields) {
  const visible = filterVisibleFields(allFields, fieldValues)
  const required = visible.filter((f) => f.is_required)
  const missingRequired = required.filter((f) => !normalizeValue(fieldValues[f.id]))
  if (missingRequired.length) {
    return { equipmentId: null, matches: filterEquipmentByValues(equipment, fieldValues, { allFields }) }
  }

  const matches = filterEquipmentByValues(equipment, fieldValues, { allFields })
  if (matches.length === 1) {
    return { equipmentId: matches[0].id, matches }
  }
  return { equipmentId: null, matches }
}

export function visibleAssetSections(sections, fieldValues) {
  const allFields = flattenAssetSections(sections)
  return (sections || []).map((section) => ({
    ...section,
    fields: filterVisibleFields(section.fields || [], fieldValues),
  })).filter((section) => section.fields.length > 0)
}

export function isAssetSelectionComplete(equipment, fieldValues, sections, equipmentId) {
  if (equipmentId) return true
  const allFields = flattenAssetSections(sections)
  if (!allFields.length) return Boolean(equipmentId)
  const visible = filterVisibleFields(allFields, fieldValues)
  const required = visible.filter((f) => f.is_required)
  if (required.some((f) => !normalizeValue(fieldValues[f.id]))) return false
  const { equipmentId: resolved } = resolveEquipmentFromSelection(equipment, fieldValues, allFields)
  return Boolean(resolved)
}

export { isFieldDependencyMet }
