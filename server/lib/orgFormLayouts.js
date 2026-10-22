import { supabaseAdmin } from '../services/supabase.js'
import { applyFormLayout } from './applyFormLayout.js'
import {
  LAYOUT_VERSION,
  catalogId,
  cloneLayout,
  fieldLayoutId,
  normalizeColSpan,
  normalizeFilledBy,
  parseLayoutId,
  FIELD_WIDTHS,
  isGroupId,
} from './formLayoutIds.js'
import {
  buildDefaultLayout,
  getFormDef,
  publicFormMeta,
} from './formRegistry.js'
import { getMasterSource, publicMasterSources, canFilterMasterBy } from './formFieldSources.js'
import { normalizeOptions, sanitizeOptionRule } from './formOptionRules.js'
import { createTtlCache } from './ttlCache.js'

const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

const CATALOG_SELECT = [
  'id',
  'name',
  'kind',
  'parent_id',
  'section_id',
  'field_type',
  'sort_order',
  'is_active',
  'is_required',
  'depends_on_parent_id',
  'depends_on_option',
  'icon_path',
].join(', ')

const catalogCache = createTtlCache({ ttlMs: 30_000, maxEntries: 500 })
const layoutCache = createTtlCache({ ttlMs: 30_000, maxEntries: 1000 })

export function invalidateOrgFormCaches(orgId, formId = null) {
  if (!orgId) {
    catalogCache.clear()
    layoutCache.clear()
    return
  }
  catalogCache.delete(`catalog:${orgId}`)
  if (formId) {
    layoutCache.delete(`layout:${orgId}:${formId}`)
  } else {
    layoutCache.clear()
  }
}

export function isMissingFormLayoutsTable(error) {
  const msg = String(error?.message || '')
  return /org_form_layouts|org_form_field_values/i.test(msg) && /does not exist/i.test(msg)
}

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export async function loadOrgCatalogFields(orgId) {
  const cacheKey = `catalog:${orgId}`
  const cached = catalogCache.get(cacheKey)
  if (cached) return cached

  const [assetResult, equipmentResult] = await Promise.all([
    supabaseAdmin
      .from('asset_fields')
      .select(CATALOG_SELECT)
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
    supabaseAdmin
      .from('equipment_fields')
      .select(CATALOG_SELECT)
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
  ])

  if (assetResult.error) throw assetResult.error
  if (equipmentResult.error) throw equipmentResult.error

  const byId = new Map()
  for (const row of assetResult.data || []) {
    byId.set(row.id, { ...row, field_source: 'asset' })
  }
  for (const row of equipmentResult.data || []) {
    if (row.kind === 'section' && byId.has(row.id)) continue
    byId.set(row.id, { ...row, field_source: row.kind === 'section' ? 'asset' : 'equipment' })
  }

  const rows = [...byId.values()]
  const childrenByParent = new Map()
  for (const row of rows) {
    if (row.kind === 'child' && row.parent_id && row.is_active !== false) {
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, [])
      childrenByParent.get(row.parent_id).push(row)
    }
  }

  const sectionNameById = new Map(
    rows.filter((row) => row.kind === 'section').map((row) => [row.id, row.name]),
  )

  const result = rows.map((row) => ({
    ...row,
    section_name: row.section_id ? (sectionNameById.get(row.section_id) || null) : row.name,
    dropdown_options: OPTION_FIELD_TYPES.has(row.field_type)
      ? (childrenByParent.get(row.id) || []).map((child) => child.name)
      : undefined,
  }))
  catalogCache.set(cacheKey, result)
  return result
}

function sanitizeLayoutField(field, index, { allowBindKey = true, requireSectionId = true } = {}) {
  if (!field?.id) {
    throw httpError('Each layout field needs an id')
  }
  if (requireSectionId && !field?.sectionId) {
    throw httpError('Each layout field needs id and sectionId')
  }
  const label = typeof field.label === 'string' ? field.label.trim() : ''
  const fieldType = typeof field.fieldType === 'string' ? field.fieldType.trim() : ''
  const masterSource = typeof field.masterSource === 'string' ? field.masterSource.trim() : ''
  const bindKey = allowBindKey && typeof field.bindKey === 'string' ? field.bindKey.trim() : ''
  const options = !masterSource
    ? normalizeOptions(field.options).map((entry) => {
      const rules = (entry.rules || []).map(sanitizeOptionRule).filter(Boolean)
      return {
        label: entry.label,
        value: entry.value,
        ...(rules.length ? { rules } : {}),
      }
    })
    : []
  const dependsOnFieldId = typeof field.dependsOnFieldId === 'string'
    ? field.dependsOnFieldId.trim()
    : ''
  const dependsOnOptions = Array.isArray(field.dependsOnOptions)
    ? field.dependsOnOptions.map((item) => {
      if (item && typeof item === 'object') return String(item.value || item.label || '').trim()
      return String(item ?? '').trim()
    }).filter(Boolean)
    : []
  const filterByFieldId = typeof field.filterByFieldId === 'string'
    ? field.filterByFieldId.trim()
    : ''
  return {
    id: fieldLayoutId(field),
    ...(field.sectionId ? { sectionId: fieldLayoutId({ id: field.sectionId }) } : {}),
    order: Number.isFinite(Number(field.order)) ? Number(field.order) : index,
    colSpan: normalizeColSpan(field.colSpan, 25),
    required: Boolean(field.required),
    ...(label ? { label } : {}),
    ...(fieldType ? { fieldType } : {}),
    ...(masterSource ? { masterSource } : {}),
    ...(allowBindKey && bindKey ? { bindKey } : {}),
    ...(!masterSource && options.length ? { options } : {}),
    ...(dependsOnFieldId ? { dependsOnFieldId } : {}),
    ...(dependsOnFieldId && dependsOnOptions.length ? { dependsOnOptions } : {}),
    ...(masterSource && filterByFieldId ? { filterByFieldId } : {}),
  }
}

function sanitizeLayout(raw) {
  if (!raw || typeof raw !== 'object') {
    throw httpError('layout is required')
  }
  const sections = Array.isArray(raw.sections) ? raw.sections : null
  const fields = Array.isArray(raw.fields) ? raw.fields : null
  if (!sections || !fields) {
    throw httpError('layout must include sections and fields arrays')
  }
  const groups = Array.isArray(raw.groups) ? raw.groups : []

  return {
    v: LAYOUT_VERSION,
    sections: sections.map((section, index) => {
      if (!section?.id) throw httpError('Each layout section needs an id')
      const id = fieldLayoutId(section)
      const label = typeof section.label === 'string' ? section.label.trim() : ''
      const filledBy = normalizeFilledBy(section.filledBy)
      return {
        id,
        order: Number.isFinite(Number(section.order)) ? Number(section.order) : index,
        ...(label ? { label } : {}),
        ...(filledBy !== 'any' ? { filledBy } : {}),
      }
    }),
    fields: fields.map((field, index) => sanitizeLayoutField(field, index, {
      allowBindKey: true,
      requireSectionId: true,
    })),
    groups: groups.map((group, index) => {
      if (!group?.id || !group?.sectionId) {
        throw httpError('Each layout group needs id and sectionId')
      }
      const id = fieldLayoutId(group)
      if (!isGroupId(id)) {
        throw httpError('Repeatable groups must use group: ids')
      }
      const label = typeof group.label === 'string' ? group.label.trim() : ''
      const minRows = Math.max(0, Math.min(50, Number(group.minRows) || 0))
      const maxRows = Math.max(1, Math.min(50, Number(group.maxRows) || 20))
      if (minRows > maxRows) {
        throw httpError(`Group "${label || id}" minRows cannot exceed maxRows`)
      }
      const childFields = Array.isArray(group.childFields) ? group.childFields : []
      return {
        id,
        sectionId: fieldLayoutId({ id: group.sectionId }),
        order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
        colSpan: 100,
        label: label || 'Items',
        minRows,
        maxRows,
        childFields: childFields.map((child, childIndex) => {
          const cleaned = sanitizeLayoutField(child, childIndex, {
            allowBindKey: false,
            requireSectionId: false,
          })
          if (cleaned.bindKey) {
            throw httpError(`Group child "${cleaned.label || cleaned.id}" cannot use bindKey`)
          }
          const parsed = parseLayoutId(cleaned.id)
          if (parsed.kind !== 'field') {
            throw httpError(`Group child fields must use field: ids (${cleaned.id})`)
          }
          return cleaned
        }),
      }
    }),
  }
}

export function validateFormLayout(formDef, layout, catalogFields) {
  const cleaned = sanitizeLayout(layout)
  const knownSystemFields = new Set((formDef.systemFields || []).map((item) => item.id))
  const knownSystemSections = new Set((formDef.systemSections || []).map((item) => item.id))
  const catalogIds = new Set((catalogFields || []).map((row) => String(row.id)))
  const sectionIds = new Set(cleaned.sections.map((section) => section.id))

  for (const section of cleaned.sections) {
    const parsed = parseLayoutId(section.id)
    if (parsed.kind === 'system' && !knownSystemSections.has(section.id)) {
      throw httpError(`Unknown section ${section.id}`)
    }
    if (parsed.kind === 'catalog' && !catalogIds.has(parsed.value)) {
      throw httpError('Layout references a section that no longer exists')
    }
    if (parsed.kind === 'master') {
      throw httpError('Masters cannot be used as sections')
    }
    if (parsed.kind === 'group') {
      throw httpError('Groups cannot be used as sections')
    }
    if (section.filledBy && !['any', 'creator', 'order_to_dept_head', 'technician'].includes(section.filledBy)) {
      throw httpError(`Invalid filledBy on section ${section.id}`)
    }
  }

  function validateFieldEntry(field, knownFieldIds, { allowMaster = true, allowCatalog = true, allowSystem = true } = {}) {
    if (field.sectionId && !sectionIds.has(field.sectionId)) {
      throw httpError('Layout field is missing its section')
    }
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system') {
      if (!allowSystem) throw httpError(`Group child cannot be a system field (${field.id})`)
      if (!knownSystemFields.has(field.id)) {
        throw httpError(`Unknown field ${field.id}`)
      }
    }
    if (parsed.kind === 'master') {
      if (!allowMaster) throw httpError(`Group child cannot be a master field (${field.id})`)
      if (!getMasterSource(parsed.value)) {
        throw httpError(`Unknown master ${parsed.value}`)
      }
    }
    if (parsed.kind === 'field') {
      if (field.masterSource && !getMasterSource(field.masterSource)) {
        throw httpError(`Unknown master map ${field.masterSource}`)
      }
      if (field.dependsOnFieldId) {
        const parentExists = knownFieldIds.has(field.dependsOnFieldId)
        if (!parentExists) {
          throw httpError(`Child field "${field.label || field.id}" depends on a missing parent`)
        }
        if (!Array.isArray(field.dependsOnOptions) || !field.dependsOnOptions.length) {
          throw httpError(`Child field "${field.label || field.id}" needs parent options`)
        }
      }
      if (field.filterByFieldId) {
        // filterBy only applies among known siblings (top-level or within group)
        const filterParentId = field.filterByFieldId
        if (!knownFieldIds.has(filterParentId) && !cleaned.fields.some((item) => item.id === filterParentId)) {
          throw httpError(`Field "${field.label || field.id}" filters by a missing field`)
        }
        if (field.filterByFieldId === field.id) {
          throw httpError(`Field "${field.label || field.id}" cannot filter by itself`)
        }
      }
    }
    if ((parsed.kind === 'master' || parsed.kind === 'field') && field.filterByFieldId) {
      if (parsed.kind === 'master') {
        const filterParent = cleaned.fields.find((item) => item.id === field.filterByFieldId)
        if (!filterParent) {
          throw httpError(`Field "${field.label || field.id}" filters by a missing field`)
        }
        const parentSource = filterParent.masterSource
          || (parseLayoutId(filterParent.id).kind === 'master' ? parseLayoutId(filterParent.id).value : '')
        if (!canFilterMasterBy(parsed.value, parentSource)) {
          throw httpError(
            `Field "${field.label || field.id}" cannot filter by "${filterParent.label || filterParent.id}"`,
          )
        }
      }
      if (parsed.kind === 'field' && field.masterSource) {
        const filterParent = cleaned.fields.find((item) => item.id === field.filterByFieldId)
          || (knownFieldIds.has(field.filterByFieldId)
            ? { id: field.filterByFieldId }
            : null)
        if (!filterParent) {
          throw httpError(`Field "${field.label || field.id}" filters by a missing field`)
        }
        const parentSource = filterParent.masterSource
          || (parseLayoutId(filterParent.id).kind === 'master' ? parseLayoutId(filterParent.id).value : '')
        const childSource = field.masterSource
        if (parentSource && !canFilterMasterBy(childSource, parentSource)) {
          throw httpError(
            `Field "${field.label || field.id}" cannot filter by "${filterParent.label || filterParent.id}"`,
          )
        }
      }
    }
    if (parsed.kind === 'custom') {
      throw httpError('Custom ids are for sections, not fields')
    }
    if (parsed.kind === 'group') {
      throw httpError('Groups cannot be placed as fields')
    }
    if (parsed.kind === 'catalog') {
      if (!allowCatalog) throw httpError(`Group child cannot be a catalog field (${field.id})`)
      if (!formDef.allowCatalogFields) {
        throw httpError('This form does not accept catalog fields')
      }
      if (!catalogIds.has(parsed.value)) {
        throw httpError('Layout references a field that no longer exists')
      }
    }
    if (!FIELD_WIDTHS.includes(field.colSpan)) {
      throw httpError('Field width must be 25%, 33%, 75%, or 100%')
    }
  }

  const topFieldIds = new Set(cleaned.fields.map((field) => field.id))
  for (const field of cleaned.fields) {
    validateFieldEntry(field, topFieldIds)
  }

  const allGroupChildIds = new Set()
  for (const group of cleaned.groups) {
    if (!sectionIds.has(group.sectionId)) {
      throw httpError(`Group "${group.label || group.id}" is missing its section`)
    }
    if (!FIELD_WIDTHS.includes(group.colSpan)) {
      throw httpError('Group width must be 25%, 33%, 75%, or 100%')
    }
    const childIds = new Set(group.childFields.map((child) => child.id))
    for (const child of group.childFields) {
      if (topFieldIds.has(child.id) || allGroupChildIds.has(child.id)) {
        throw httpError(`Duplicate field id in group: ${child.id}`)
      }
      allGroupChildIds.add(child.id)
      validateFieldEntry(child, childIds, {
        allowMaster: false,
        allowCatalog: false,
        allowSystem: false,
      })
      if (child.bindKey) {
        throw httpError(`Group child "${child.label || child.id}" cannot use bindKey`)
      }
      if (child.dependsOnFieldId && !childIds.has(child.dependsOnFieldId)) {
        throw httpError(`Group child "${child.label || child.id}" depends on a field outside its group`)
      }
      for (const option of child.options || []) {
        for (const rule of option.rules || []) {
          if (!childIds.has(rule.targetFieldId)) {
            throw httpError(`Rule on "${child.label || child.id}" must target a field in the same group`)
          }
          if (rule.action === 'copyFrom' || rule.action === 'excludeFrom') {
            if (!childIds.has(rule.sourceFieldId)) {
              throw httpError(`Rule source on "${child.label || child.id}" must be in the same group`)
            }
          }
        }
      }
    }
  }

  for (const field of cleaned.fields) {
    for (const option of field.options || []) {
      for (const rule of option.rules || []) {
        if (!topFieldIds.has(rule.targetFieldId)) {
          throw httpError(`Rule on "${field.label || field.id}" targets a missing field`)
        }
        if (rule.targetFieldId === field.id) {
          throw httpError(`Field "${field.label || field.id}" cannot target itself in a rule`)
        }
        if (rule.action === 'copyFrom' || rule.action === 'excludeFrom') {
          if (!topFieldIds.has(rule.sourceFieldId)) {
            throw httpError(
              `${rule.action === 'excludeFrom' ? 'Exclude-from' : 'Copy-from'} rule on "${field.label || field.id}" references a missing source`,
            )
          }
        }
      }
    }
  }

  if (formDef.formId === 'equipment.create') {
    const qrFieldId = typeof layout.qrFieldId === 'string' ? layout.qrFieldId.trim() : ''
    if (qrFieldId) {
      if (!topFieldIds.has(qrFieldId)) {
        throw httpError('QR code field must be a field on this form')
      }
      cleaned.qrFieldId = qrFieldId
    }
  }

  return cleaned
}

export async function getSavedFormLayout(orgId, formId) {
  const cacheKey = `layout:${orgId}:${formId}`
  const cached = layoutCache.get(cacheKey)
  if (cached !== undefined) return cached

  const { data, error } = await supabaseAdmin
    .from('org_form_layouts')
    .select('form_id, layout, updated_at')
    .eq('org_id', orgId)
    .eq('form_id', formId)
    .maybeSingle()

  if (error) {
    if (isMissingFormLayoutsTable(error)) return null
    throw error
  }
  const result = data || null
  layoutCache.set(cacheKey, result)
  return result
}

export async function listSavedFormLayouts(orgId) {
  const { data, error } = await supabaseAdmin
    .from('org_form_layouts')
    .select('form_id, layout, updated_at')
    .eq('org_id', orgId)

  if (error) {
    if (isMissingFormLayoutsTable(error)) return []
    throw error
  }
  return data || []
}

export async function upsertFormLayout(orgId, formId, layout) {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('org_form_layouts')
    .upsert({
      org_id: orgId,
      form_id: formId,
      layout,
      updated_at: now,
    }, { onConflict: 'org_id,form_id' })
    .select('form_id, layout, updated_at')
    .single()

  if (error) throw error
  invalidateOrgFormCaches(orgId, formId)
  return data
}

export async function buildFormLayoutPayload(orgId, formId) {
  const formDef = getFormDef(formId)
  if (!formDef) throw httpError('Unknown form', 404)

  const [catalogFields, saved] = await Promise.all([
    loadOrgCatalogFields(orgId),
    getSavedFormLayout(orgId, formId),
  ])

  return {
    form: publicFormMeta({ ...formDef, moduleId: formDef.moduleId, moduleLabel: formDef.moduleLabel }),
    layout: saved?.layout || null,
    defaultLayout: buildDefaultLayout(formDef, catalogFields),
    updated_at: saved?.updated_at || null,
    catalog: {
      sections: catalogFields.filter((row) => row.kind === 'section'),
      parents: catalogFields.filter((row) => row.kind === 'parent'),
    },
    masters: publicMasterSources(),
  }
}

export async function saveOrgFormLayout(orgId, formId, rawLayout) {
  const formDef = getFormDef(formId)
  if (!formDef) throw httpError('Unknown form', 404)
  const catalogFields = await loadOrgCatalogFields(orgId)
  const layout = validateFormLayout(formDef, rawLayout, catalogFields)
  const saved = await upsertFormLayout(orgId, formId, layout)
  return {
    form: publicFormMeta(formDef),
    layout: saved.layout,
    defaultLayout: buildDefaultLayout(formDef, catalogFields),
    updated_at: saved.updated_at,
    masters: publicMasterSources(),
  }
}

export async function loadRuntimeFormLayout(orgId, formId) {
  const saved = await getSavedFormLayout(orgId, formId)
  return saved?.layout || null
}

export function applySavedLayout(schema, layout, catalogFields) {
  if (!layout) return schema
  return applyFormLayout(schema, cloneLayout(layout), { catalogFields })
}

export async function attachFormFieldValueMaps(orgId, formId, rows) {
  const ids = (rows || []).map((row) => row.id).filter(Boolean)
  if (!ids.length) return rows || []
  const { data, error } = await supabaseAdmin
    .from('org_form_field_values')
    .select('record_id, field_id, value_json')
    .eq('org_id', orgId)
    .eq('form_id', formId)
    .in('record_id', ids)

  if (error) {
    if (isMissingFormLayoutsTable(error)) return rows
    return rows
  }

  const byRecord = new Map()
  for (const value of data || []) {
    if (!byRecord.has(value.record_id)) byRecord.set(value.record_id, {})
    byRecord.get(value.record_id)[value.field_id] = value.value_json
  }

  return rows.map((row) => ({
    ...row,
    field_values: {
      ...(row.field_values || {}),
      ...(byRecord.get(row.id) || {}),
    },
  }))
}

export async function listFormFieldValues(orgId, formId, recordId) {
  const { data, error } = await supabaseAdmin
    .from('org_form_field_values')
    .select('field_id, value_json')
    .eq('org_id', orgId)
    .eq('form_id', formId)
    .eq('record_id', recordId)

  if (error) {
    if (isMissingFormLayoutsTable(error)) return {}
    throw error
  }

  const values = {}
  for (const row of data || []) {
    values[row.field_id] = row.value_json
  }
  return values
}

export async function upsertFormFieldValues(orgId, formId, recordId, values) {
  const entries = Object.entries(values || {}).map(([fieldId, value]) => ([
    String(fieldId),
    value,
  ]))
  const now = new Date().toISOString()
  const rows = entries.map(([fieldId, value]) => ({
    org_id: orgId,
    form_id: formId,
    record_id: recordId,
    field_id: fieldId,
    value_json: value ?? null,
    updated_at: now,
  }))

  if (rows.length) {
    const { error } = await supabaseAdmin
      .from('org_form_field_values')
      .upsert(rows, { onConflict: 'org_id,form_id,record_id,field_id' })
    if (error) throw error
  }

  const keepIds = new Set(entries.map(([fieldId]) => fieldId))
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('org_form_field_values')
    .select('id, field_id')
    .eq('org_id', orgId)
    .eq('form_id', formId)
    .eq('record_id', recordId)

  if (existingError) {
    if (isMissingFormLayoutsTable(existingError)) return listFormFieldValues(orgId, formId, recordId)
    throw existingError
  }

  const staleIds = (existing || [])
    .filter((row) => !keepIds.has(row.field_id))
    .map((row) => row.id)

  if (staleIds.length) {
    const { error } = await supabaseAdmin
      .from('org_form_field_values')
      .delete()
      .in('id', staleIds)
    if (error) throw error
  }

  return listFormFieldValues(orgId, formId, recordId)
}

export { catalogId }
