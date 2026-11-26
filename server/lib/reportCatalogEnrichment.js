import { loadOrgCatalogFields } from './orgFormLayouts.js'
import { catalogCellValue } from './csvExportColumns.js'
import { columnsForReport, isDynamicReportColumnId } from './reportConstants.js'

export function catalogParentFields(catalogFields = []) {
  return (catalogFields || []).filter((field) => (
    field?.id
    && field?.name
    && field.is_active !== false
    && field.field_type !== 'file'
    && field.field_type !== 'image'
    && (!field.kind || field.kind === 'parent')
  ))
}

export function parseCatalogFilters(raw) {
  if (!raw) return {}
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    const fieldId = String(key || '').replace(/^field:/i, '').trim()
    const text = String(value ?? '').trim()
    if (!fieldId || !text) continue
    out[fieldId] = text
  }
  return out
}

export function sameCatalogText(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
}

export function matchesCatalogFilters(equipmentId, valuesByEquipment, catalogFilters) {
  const entries = Object.entries(catalogFilters || {})
  if (!entries.length) return true
  if (!equipmentId) return false
  const values = valuesByEquipment?.get?.(equipmentId) || {}
  for (const [fieldId, expected] of entries) {
    if (!sameCatalogText(values[fieldId], expected)) return false
  }
  return true
}

export function stripPrivateReportKeys(row, privateKeys = []) {
  const next = { ...row }
  delete next.field_values
  for (const key of privateKeys) delete next[key]
  return next
}

/**
 * Stamp catalog parent values as field:<uuid> on report rows.
 * Keeps private _* keys so callers can strip after filtering/KPIs.
 */
export async function enrichRowsWithCatalogParents(orgId, rows, {
  equipmentIdKey = '_equipment_id',
  valuesByEquipment = null,
  formLayoutId = null,
  attachFormFieldValueMaps = null,
  loadEquipmentValuesByIds = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return list

  const equipmentIds = list.map((row) => row?.[equipmentIdKey]).filter(Boolean)
  const [catalogFields, valuesMap, withFormValues] = await Promise.all([
    loadOrgCatalogFields(orgId).catch(() => []),
    valuesByEquipment
      ? Promise.resolve(valuesByEquipment)
      : (typeof loadEquipmentValuesByIds === 'function'
        ? loadEquipmentValuesByIds(orgId, equipmentIds)
        : Promise.resolve(new Map())),
    formLayoutId && typeof attachFormFieldValueMaps === 'function'
      ? attachFormFieldValueMaps(orgId, formLayoutId, list)
      : Promise.resolve(list),
  ])

  const parentFields = catalogParentFields(catalogFields)
  return withFormValues.map((row) => {
    const equipmentId = row?.[equipmentIdKey]
    const equipmentValues = equipmentId ? (valuesMap.get(equipmentId) || {}) : {}
    const existing = typeof row.field_values === 'object' && row.field_values && !Array.isArray(row.field_values)
      ? row.field_values
      : {}
    const withValues = { ...row, field_values: { ...existing, ...equipmentValues } }
    const dynamic = {}
    for (const field of parentFields) {
      dynamic[`field:${field.id}`] = catalogCellValue(withValues, field)
    }
    return { ...withValues, ...dynamic }
  })
}

export async function catalogColumnDefsForOrg(orgId) {
  const catalogFields = await loadOrgCatalogFields(orgId).catch(() => [])
  return catalogParentFields(catalogFields).map((field) => ({
    id: `field:${field.id}`,
    label: field.name,
    fieldId: field.id,
    fieldName: field.name,
    fieldType: field.field_type,
  }))
}

export async function resolveReportExportColumns(orgId, kind, selected = []) {
  const base = columnsForReport(kind)
  const byId = new Map(base.map((col) => [col.id, col]))
  const catalogDefs = await catalogColumnDefsForOrg(orgId)
  for (const col of catalogDefs) byId.set(col.id, col)

  const requested = (Array.isArray(selected) ? selected : [])
    .map((item) => {
      if (item && typeof item === 'object' && item.id) {
        return byId.get(item.id) || item
      }
      return byId.get(item)
    })
    .filter((col) => col?.id && (byId.has(col.id) || isDynamicReportColumnId(col.id)))

  return requested.length ? requested : base
}
