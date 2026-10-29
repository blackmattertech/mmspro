import { supabaseAdmin } from '../services/supabase.js'
import { applyFormLayout } from './applyFormLayout.js'
import {
  LAYOUT_VERSION,
  catalogId,
  cloneLayout,
  fieldLayoutId,
  normalizeColSpan,
  normalizeFilledBy,
  normalizeStage,
  parseLayoutId,
  FIELD_WIDTHS,
  isGroupId,
} from './formLayoutIds.js'
import {
  buildDefaultLayout,
  getFormDef,
  isFormId,
  isKnownSystemField,
  isKnownSystemSection,
  publicFormMeta,
} from './formRegistry.js'
import { shouldFallbackWorkOrderLayout } from './workOrderForms.js'
import { getMasterSource, publicMasterSources, canFilterMasterBy } from './formFieldSources.js'
import { normalizeOptions, sanitizeOptionRule } from './formOptionRules.js'
import { createTtlCache } from './ttlCache.js'

const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

const LEGACY_EQUIPMENT_LABELS = {
  Equipment: 'Asset',
  'Equipment picker': 'Asset picker',
}

function presentEquipmentLabels(layout) {
  if (!layout) return layout
  const next = cloneLayout(layout)
  const rename = (item) => {
    if (item && LEGACY_EQUIPMENT_LABELS[item.label]) {
      item.label = LEGACY_EQUIPMENT_LABELS[item.label]
    }
  }
  for (const field of next.fields || []) rename(field)
  for (const group of next.groups || []) {
    rename(group)
    for (const child of group.childFields || []) rename(child)
  }
  return next
}

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
  catalogCache.delete(`catalog-asset:${orgId}`)
  catalogCache.delete(`catalog-meta:${orgId}`)
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
  catalogCache.set(`catalog-asset:${orgId}`, result.filter((row) => row.field_source === 'asset'))
  return result
}

/** Asset parents and sections only — enough to count Form Master dropdowns. */
export async function loadOrgAssetCatalogMeta(orgId) {
  const cacheKey = `catalog-meta:${orgId}`
  const cached = catalogCache.get(cacheKey)
  if (cached) return cached
  const fromFull = catalogCache.get(`catalog-asset:${orgId}`) || catalogCache.get(`catalog:${orgId}`)
  if (fromFull) {
    const meta = fromFull
      .filter((row) => row.kind === 'parent' || row.kind === 'section')
      .map((row) => ({ ...row, field_source: row.field_source || 'asset' }))
    catalogCache.set(cacheKey, meta)
    return meta
  }

  const { data, error } = await supabaseAdmin
    .from('asset_fields')
    .select('id, name, kind, section_id, field_type, sort_order, is_active')
    .eq('org_id', orgId)
    .in('kind', ['parent', 'section'])
    .order('sort_order')
    .order('name')
  if (error) throw error
  const result = (data || []).map((row) => ({ ...row, field_source: 'asset' }))
  catalogCache.set(cacheKey, result)
  return result
}

export async function loadOrgAssetCatalogFields(orgId) {
  const cacheKey = `catalog-asset:${orgId}`
  const cached = catalogCache.get(cacheKey)
  if (cached) return cached
  const full = catalogCache.get(`catalog:${orgId}`)
  if (full) {
    const assetOnly = full.filter((row) => row.field_source === 'asset')
    catalogCache.set(cacheKey, assetOnly)
    return assetOnly
  }

  const { data, error } = await supabaseAdmin
    .from('asset_fields')
    .select(CATALOG_SELECT)
    .eq('org_id', orgId)
    .order('sort_order')
    .order('name')
  if (error) throw error

  const rows = (data || []).map((row) => ({ ...row, field_source: 'asset' }))
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
  const defaultToCurrentUser = (masterSource === 'employees' || masterSource === 'employees_multi')
    && field.defaultToCurrentUser === true
  const equipmentColumnId = !masterSource && typeof field.equipmentColumnId === 'string'
    ? field.equipmentColumnId.trim()
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
    ...(!masterSource && !equipmentColumnId && options.length ? { options } : {}),
    ...(equipmentColumnId ? { equipmentColumnId, fieldType: fieldType || 'dropdown' } : {}),
    ...(dependsOnFieldId ? { dependsOnFieldId } : {}),
    ...(dependsOnFieldId && dependsOnOptions.length ? { dependsOnOptions } : {}),
    ...(masterSource && filterByFieldId ? { filterByFieldId } : {}),
    ...(defaultToCurrentUser ? { defaultToCurrentUser: true } : {}),
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
      const stage = normalizeStage(section.stage)
      const sharedWith = Array.isArray(section.sharedWith)
        ? [...new Set(section.sharedWith.map((item) => String(item || '').trim()).filter(Boolean))].sort()
        : []
      return {
        id,
        order: Number.isFinite(Number(section.order)) ? Number(section.order) : index,
        ...(label ? { label } : {}),
        ...(filledBy !== 'any' ? { filledBy } : {}),
        ...(stage ? { stage } : {}),
        ...(sharedWith.length ? { sharedWith } : {}),
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
    if (parsed.kind === 'system' && !knownSystemSections.has(section.id) && !isKnownSystemSection(section.id)) {
      throw httpError(`Unknown section ${section.id}`)
    }
    if (section.sharedWith?.length) {
      const peers = section.sharedWith.filter((id) => id !== formDef.formId && isFormId(id))
      if (peers.length) section.sharedWith = [formDef.formId, ...peers].sort()
      else delete section.sharedWith
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
    if (section.filledBy && !['any', 'creator', 'order_to_dept_head', 'technician', 'supervisor'].includes(section.filledBy)) {
      throw httpError(`Invalid filledBy on section ${section.id}`)
    }
    if (section.stage && !['create', 'assignment', 'execution', 'closeout'].includes(section.stage)) {
      throw httpError(`Invalid stage on section ${section.id}`)
    }
  }

  function validateFieldEntry(field, knownFieldIds, { allowMaster = true, allowCatalog = true, allowSystem = true } = {}) {
    if (field.sectionId && !sectionIds.has(field.sectionId)) {
      throw httpError('Layout field is missing its section')
    }
    const parsed = parseLayoutId(field.id)
    if (parsed.kind === 'system') {
      if (!allowSystem) throw httpError(`Group child cannot be a system field (${field.id})`)
      if (!knownSystemFields.has(field.id) && !isKnownSystemField(field.id)) {
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
      throw httpError('Field width must be 25%, 33%, 50%, 75%, or 100%')
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
      throw httpError('Group width must be 25%, 33%, 50%, 75%, or 100%')
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
  const rows = data || []
  for (const row of rows) {
    layoutCache.set(`layout:${orgId}:${row.form_id}`, row)
  }
  return rows
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
    layout: presentEquipmentLabels(saved?.layout) || null,
    defaultLayout: buildDefaultLayout(formDef, catalogFields),
    updated_at: saved?.updated_at || null,
    catalog: {
      sections: catalogFields.filter((row) => row.kind === 'section'),
      parents: catalogFields.filter((row) => row.kind === 'parent'),
    },
    masters: publicMasterSources(),
  }
}

function peersOf(section, formId) {
  return (section?.sharedWith || []).filter((id) => id && id !== formId && isFormId(id))
}

function extractSectionSnapshot(layout, sectionId) {
  const section = (layout?.sections || []).find((item) => item.id === sectionId)
  if (!section) return null
  return {
    section: { ...section },
    fields: (layout.fields || []).filter((field) => field.sectionId === sectionId).map((field) => ({ ...field })),
    groups: (layout.groups || []).filter((group) => group.sectionId === sectionId).map((group) => ({
      ...group,
      childFields: (group.childFields || []).map((field) => ({ ...field })),
    })),
  }
}

function applySectionSnapshot(layout, snapshot) {
  const sectionId = snapshot.section.id
  const existing = (layout.sections || []).find((section) => section.id === sectionId)
  const section = {
    ...snapshot.section,
    order: existing ? existing.order : (layout.sections || []).length,
  }
  layout.sections = existing
    ? layout.sections.map((item) => (item.id === sectionId ? section : item))
    : [...(layout.sections || []), section]
  const incomingFieldIds = new Set((snapshot.fields || []).map((field) => field.id))
  const incomingGroupIds = new Set((snapshot.groups || []).map((group) => group.id))
  layout.fields = [
    ...(layout.fields || []).filter((field) => field.sectionId !== sectionId && !incomingFieldIds.has(field.id)),
    ...(snapshot.fields || []),
  ]
  layout.groups = [
    ...(layout.groups || []).filter((group) => group.sectionId !== sectionId && !incomingGroupIds.has(group.id)),
    ...(snapshot.groups || []),
  ]
  return layout
}

function removeSectionFromLayout(layout, sectionId) {
  layout.sections = (layout.sections || [])
    .filter((section) => section.id !== sectionId)
    .map((section, index) => ({ ...section, order: index }))
  layout.fields = (layout.fields || []).filter((field) => field.sectionId !== sectionId)
  layout.groups = (layout.groups || []).filter((group) => group.sectionId !== sectionId)
}

function setSectionMembership(layout, sectionId, membership) {
  const section = (layout.sections || []).find((item) => item.id === sectionId)
  if (!section) return
  const ids = [...new Set((membership || []).filter((id) => isFormId(id)))]
  if (ids.length <= 1) delete section.sharedWith
  else section.sharedWith = ids.sort()
}

async function planSharedSectionWrites(orgId, formId, previousLayout, nextLayout, catalogFields) {
  const prevById = new Map((previousLayout?.sections || []).map((section) => [section.id, section]))
  const nextById = new Map((nextLayout?.sections || []).map((section) => [section.id, section]))
  const ids = new Set([...prevById.keys(), ...nextById.keys()])
  const peerLayouts = new Map()

  const peerLayout = async (peerId) => {
    if (peerLayouts.has(peerId)) return peerLayouts.get(peerId)
    const formDef = getFormDef(peerId)
    if (!formDef) return null
    const saved = await getSavedFormLayout(orgId, peerId)
    const base = saved?.layout
      ? cloneLayout(saved.layout)
      : buildDefaultLayout(formDef, catalogFields)
    const entry = { layout: base, dirty: false }
    peerLayouts.set(peerId, entry)
    return entry
  }

  for (const id of ids) {
    const prev = prevById.get(id)
    const next = nextById.get(id)
    const prevPeers = peersOf(prev, formId)
    const nextPeers = peersOf(next, formId)
    if (!prevPeers.length && !nextPeers.length) continue

    if (next && nextPeers.length) {
      const snapshot = extractSectionSnapshot(nextLayout, id)
      for (const peerId of nextPeers) {
        const entry = await peerLayout(peerId)
        if (!entry || !snapshot) continue
        applySectionSnapshot(entry.layout, snapshot)
        entry.dirty = true
      }
    }

    if (!next) {
      const membership = (prev?.sharedWith || []).filter((peerId) => peerId !== formId)
      for (const peerId of prevPeers) {
        const entry = await peerLayout(peerId)
        if (!entry) continue
        setSectionMembership(entry.layout, id, membership)
        entry.dirty = true
      }
      continue
    }

    for (const peerId of prevPeers) {
      if (nextPeers.includes(peerId)) continue
      const entry = await peerLayout(peerId)
      if (!entry) continue
      removeSectionFromLayout(entry.layout, id)
      entry.dirty = true
    }
  }

  return [...peerLayouts.entries()]
    .filter(([, entry]) => entry.dirty)
    .map(([peerId, entry]) => ({ formId: peerId, layout: entry.layout }))
}

export async function saveOrgFormLayout(orgId, formId, rawLayout) {
  const formDef = getFormDef(formId)
  if (!formDef) throw httpError('Unknown form', 404)
  const catalogFields = await loadOrgCatalogFields(orgId)
  const previous = await getSavedFormLayout(orgId, formId)
  const layout = validateFormLayout(formDef, rawLayout, catalogFields)
  const peerWrites = await planSharedSectionWrites(orgId, formId, previous?.layout, layout, catalogFields)
  const validatedWrites = peerWrites.map((write) => {
    const peerDef = getFormDef(write.formId)
    if (!peerDef) throw httpError(`Unknown form ${write.formId}`)
    return {
      formId: write.formId,
      layout: validateFormLayout(peerDef, write.layout, catalogFields),
    }
  })
  const saved = await upsertFormLayout(orgId, formId, layout)
  for (const write of validatedWrites) {
    await upsertFormLayout(orgId, write.formId, write.layout)
  }
  return {
    form: publicFormMeta(formDef),
    layout: saved.layout,
    defaultLayout: buildDefaultLayout(formDef, catalogFields),
    updated_at: saved.updated_at,
    masters: publicMasterSources(),
    syncedFormIds: validatedWrites.map((write) => write.formId),
  }
}

const platformDefaultCache = createTtlCache({ ttlMs: 30_000, maxEntries: 8 })

function isMissingPlatformDefaultsTable(error) {
  const msg = String(error?.message || '')
  return /platform_form_defaults/i.test(msg) && /does not exist|schema cache/i.test(msg)
}

export function invalidatePlatformFormDefaultCache() {
  platformDefaultCache.clear()
}

export async function listPlatformFormDefaults() {
  const cached = platformDefaultCache.get('all')
  if (cached) return cached
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('form_id, layout, catalog')
  if (error) {
    if (isMissingPlatformDefaultsTable(error)) {
      const empty = new Map()
      platformDefaultCache.set('all', empty)
      return empty
    }
    throw error
  }
  const map = new Map((data || []).map((row) => [row.form_id, row]))
  platformDefaultCache.set('all', map)
  return map
}

async function getPlatformFormDefaultRow(formId) {
  const all = platformDefaultCache.get('all')
  if (all) return all.get(formId) || null
  const { data, error } = await supabaseAdmin
    .from('platform_form_defaults')
    .select('layout, catalog')
    .eq('form_id', formId)
    .maybeSingle()
  if (error) {
    if (isMissingPlatformDefaultsTable(error)) return null
    throw error
  }
  return data || null
}

export async function loadRuntimeFormLayout(orgId, formId) {
  const saved = await getSavedFormLayout(orgId, formId)
  const raw = saved?.layout
    ? presentEquipmentLabels(saved.layout)
    : presentEquipmentLabels((await getPlatformFormDefaultRow(formId))?.layout) || null
  if (!raw) {
    if (shouldFallbackWorkOrderLayout(formId)) {
      const formDef = getFormDef(formId)
      const fallback = formDef ? buildDefaultLayout(formDef, []) : null
      if (!fallback) return null
      const { applyCompanyOptionsToLayout } = await import('./formFieldMasters.js')
      const { applyLoadedCompanySkips } = await import('./formSkips.js')
      const withOptions = await applyCompanyOptionsToLayout(orgId, formId, fallback)
      return applyLoadedCompanySkips(orgId, formId, withOptions)
    }
    return null
  }
  const { applyCompanyOptionsToLayout } = await import('./formFieldMasters.js')
  const { applyLoadedCompanySkips } = await import('./formSkips.js')
  const withOptions = await applyCompanyOptionsToLayout(orgId, formId, raw)
  return applyLoadedCompanySkips(orgId, formId, withOptions)
}

export async function loadRuntimeFormBundle(orgId, formId) {
  const saved = await getSavedFormLayout(orgId, formId)
  if (saved?.layout) {
    return { layout: presentEquipmentLabels(saved.layout), catalogSource: 'org', platformCatalog: [] }
  }
  const platform = await getPlatformFormDefaultRow(formId)
  if (!platform?.layout) {
    if (shouldFallbackWorkOrderLayout(formId)) {
      const formDef = getFormDef(formId)
      return {
        layout: formDef ? buildDefaultLayout(formDef, []) : null,
        catalogSource: 'none',
        platformCatalog: [],
      }
    }
    return { layout: null, catalogSource: 'none', platformCatalog: [] }
  }
  return {
    layout: presentEquipmentLabels(platform.layout),
    catalogSource: 'platform',
    platformCatalog: platform.catalog || [],
  }
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

function normalizeLayoutLabel(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function labelsMatch(name, label) {
  const left = normalizeLayoutLabel(name)
  const right = normalizeLayoutLabel(label)
  if (!left || !right) return false
  return left === right || left === `${right}s` || right === `${left}s`
}

function storedLayoutText(raw) {
  if (raw == null || raw === '') return ''
  if (Array.isArray(raw)) return raw.map((item) => storedLayoutText(item)).filter(Boolean).join(', ')
  if (typeof raw === 'object') {
    if (raw.label != null && raw.label !== '') return storedLayoutText(raw.label)
    if (raw.name != null && raw.name !== '') return storedLayoutText(raw.name)
    if (raw.value_text != null && raw.value_text !== '') return storedLayoutText(raw.value_text)
    if (Array.isArray(raw.values)) return raw.values.map((item) => storedLayoutText(item)).filter(Boolean).join(', ')
    if (raw.value != null && typeof raw.value !== 'object') return storedLayoutText(raw.value)
    return ''
  }
  return String(raw).trim()
}

function layoutValueForField(map, field) {
  const id = String(field?.id || '')
  const bare = id.replace(/^(catalog|field|custom|system):/, '')
  const keys = [id, bare, bare ? `catalog:${bare}` : '', bare ? `field:${bare}` : ''].filter(Boolean)
  for (const key of keys) {
    const text = storedLayoutText(map[key])
    if (text) return text
  }
  return ''
}

function hierarchyLabel(row, label) {
  const items = Array.isArray(row?.asset_hierarchy) ? row.asset_hierarchy : []
  const match = items.find((item) => labelsMatch(item?.field_name, label) && String(item?.value || '').trim())
  return match ? String(match.value).trim() : ''
}

function isPriorityLayoutField(field) {
  const parsed = parseLayoutId(field?.id)
  const key = field?.bindKey || (parsed.kind === 'system' ? parsed.value : '')
  const label = String(field?.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return key === 'priority' || label === 'priority' || label === 'jobpriority'
}

function knownPriority(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return ''
}

function priorityTextFromLayout(layout, values) {
  const map = values && typeof values === 'object' ? values : {}
  for (const field of layout?.fields || []) {
    if (!isPriorityLayoutField(field)) continue
    const text = layoutValueForField(map, field)
    if (text) return text
  }
  return ''
}

function layoutFieldText(layout, values, { bindKey, label }) {
  const map = values && typeof values === 'object' ? values : {}
  for (const field of layout?.fields || []) {
    const name = String(field?.label || '').replace(/\*/g, '').trim()
    const bound = String(field?.bindKey || '')
    if (bound !== bindKey && !labelsMatch(name, label)) continue
    const text = layoutValueForField(map, field)
    if (text) return text
  }
  return ''
}

function workRequestValueMap(row) {
  return {
    ...(row?.form_field_values && typeof row.form_field_values === 'object' ? row.form_field_values : {}),
    ...(row?.field_values && typeof row.field_values === 'object' && !Array.isArray(row.field_values) ? row.field_values : {}),
  }
}

/** Custom form fields are stored beside the row. Copy them onto the columns the lists read. */
export async function fillWorkRequestShortDescriptions(orgId, rows) {
  const list = rows || []
  const openPriority = new Set(['draft', 'submitted', 'pending_approval', 'need_info', 'info_provided'])
  const pending = list.filter((row) => row?.id && (
    !String(row.short_description || '').trim()
    || !String(row.job_nature || '').trim()
    || openPriority.has(row.status)
  ))
  if (!pending.length) return list
  const [layout, catalogFields] = await Promise.all([
    loadRuntimeFormLayout(orgId, 'work_request.create'),
    loadOrgCatalogFields(orgId),
  ])
  const natureFields = (catalogFields || []).filter((field) => labelsMatch(field?.name, 'job nature'))
  const descriptionUpdates = []
  const natureUpdates = []
  const priorityUpdates = []
  for (const row of pending) {
    const values = workRequestValueMap(row)
    if (!String(row.short_description || '').trim()) {
      const text = layoutFieldText(layout, values, {
        bindKey: 'short_description',
        label: 'short description',
      })
      if (text) {
        row.short_description = text
        descriptionUpdates.push({ id: row.id, short_description: text })
      }
    }
    if (!String(row.job_nature || '').trim()) {
      let fromLayout = layoutFieldText(layout, values, {
        bindKey: 'job_nature',
        label: 'job nature',
      })
      if (!fromLayout) {
        for (const field of natureFields) {
          fromLayout = layoutValueForField(values, field)
          if (fromLayout) break
        }
      }
      const text = fromLayout || hierarchyLabel(row, 'job nature')
      if (text) {
        row.job_nature = text
        row.job_nature_label = text
        if (fromLayout) natureUpdates.push({ id: row.id, job_nature: text })
      }
    }
    if (openPriority.has(row.status)) {
      const selected = knownPriority(priorityTextFromLayout(layout, values))
      if (selected && row.priority !== selected) {
        row.priority = selected
        priorityUpdates.push({ id: row.id, priority: selected })
      }
    }
  }
  await Promise.all([
    ...descriptionUpdates.map((item) => supabaseAdmin
      .from('work_requests')
      .update({ short_description: item.short_description })
      .eq('org_id', orgId)
      .eq('id', item.id)),
    ...natureUpdates.map((item) => supabaseAdmin
      .from('work_requests')
      .update({ job_nature: item.job_nature })
      .eq('org_id', orgId)
      .eq('id', item.id)),
    ...priorityUpdates.map((item) => supabaseAdmin
      .from('work_requests')
      .update({ priority: item.priority })
      .eq('org_id', orgId)
      .eq('id', item.id)),
  ])
  return list
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

  if (formId === 'work_request.create' && recordId) {
    const layout = await loadRuntimeFormLayout(orgId, formId)
    const text = layoutFieldText(layout, values, {
      bindKey: 'short_description',
      label: 'short description',
    })
    if (text) {
      await supabaseAdmin
        .from('work_requests')
        .update({ short_description: text })
        .eq('org_id', orgId)
        .eq('id', recordId)
    }
  }

  return listFormFieldValues(orgId, formId, recordId)
}

export { catalogId }
