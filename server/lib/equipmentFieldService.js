import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { getSignedUrl } from './signedUrlCache.js'
import {
  createAssetField,
  updateAssetFieldActive,
  updateAssetFieldSchema,
  deleteAssetField,
  reorderAssetSections,
} from './assetFieldService.js'
import { invalidateOrgFormCaches, getSavedFormLayout, saveOrgFormLayout } from './orgFormLayouts.js'
import { catalogId, defaultColSpanForType } from './formLayoutIds.js'
import { applyPlatformHierarchyDefault } from './platformFormDefaults.js'

const EQUIPMENT_CREATE_FORM = 'equipment.create'

function layoutWithCatalogField(layout, field) {
  const next = JSON.parse(JSON.stringify(layout))
  const fieldLayoutId = catalogId(field.id)
  next.sections = Array.isArray(next.sections) ? next.sections : []
  next.fields = Array.isArray(next.fields) ? next.fields : []
  const sectionLayoutId = field.section_id ? catalogId(field.section_id) : (next.sections[0]?.id || null)
  if (sectionLayoutId && !next.sections.some((section) => section.id === sectionLayoutId)) {
    next.sections.push({ id: sectionLayoutId, order: next.sections.length })
  }
  if (!next.fields.some((item) => item.id === fieldLayoutId)) {
    const sectionId = sectionLayoutId || next.sections[0]?.id
    const orders = next.fields
      .filter((item) => item.sectionId === sectionId)
      .map((item) => item.order ?? 0)
    next.fields.push({
      id: fieldLayoutId,
      sectionId,
      order: orders.length ? Math.max(...orders) + 1 : 0,
      colSpan: defaultColSpanForType(field.field_type),
    })
  }
  return next
}

function layoutWithoutCatalogField(layout, fieldId) {
  const layoutId = catalogId(fieldId)
  const next = JSON.parse(JSON.stringify(layout))
  next.fields = (next.fields || []).filter((field) => field.id !== layoutId)
  next.groups = (next.groups || []).map((group) => ({
    ...group,
    childFields: (group.childFields || []).filter((field) => field.id !== layoutId),
  }))
  if (next.qrFieldId === layoutId) delete next.qrFieldId
  return next
}

function layoutReferencesCatalogField(layout, fieldId) {
  const layoutId = catalogId(fieldId)
  return (layout.fields || []).some((field) => field.id === layoutId)
    || layout.qrFieldId === layoutId
    || (layout.groups || []).some((group) => (group.childFields || []).some((field) => field.id === layoutId))
}

async function appendFieldToSavedEquipmentForm(orgId, field) {
  if (!field?.id || field.kind === 'section') return
  const saved = await getSavedFormLayout(orgId, EQUIPMENT_CREATE_FORM)
  if (!saved?.layout) return
  await saveOrgFormLayout(orgId, EQUIPMENT_CREATE_FORM, layoutWithCatalogField(saved.layout, field))
}

async function removeFieldFromSavedEquipmentForm(orgId, fieldId) {
  const saved = await getSavedFormLayout(orgId, EQUIPMENT_CREATE_FORM)
  if (!saved?.layout || !layoutReferencesCatalogField(saved.layout, fieldId)) return
  await saveOrgFormLayout(orgId, EQUIPMENT_CREATE_FORM, layoutWithoutCatalogField(saved.layout, fieldId))
}

const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'date', 'datetime', 'image', 'file', 'checkbox', 'dropdown', 'radio',
])
const OPTION_FIELD_TYPES = new Set(['dropdown', 'radio', 'checkbox'])
const SINGLE_OPTION_FIELD_TYPES = new Set(['dropdown', 'radio'])

const KINDS = new Set(['section', 'parent', 'child'])
const ORG_ASSETS_BUCKET = 'org-assets'

export function parseDependsOnOptions(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))]
  }
  const str = String(raw).trim()
  if (!str) return []
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))]
      }
    } catch {
      // fall through
    }
  }
  return [str]
}

function serializeDependsOnOptions(options) {
  const list = parseDependsOnOptions(options)
  if (!list.length) return null
  if (list.length === 1) return list[0]
  return JSON.stringify(list)
}

async function attachSectionIconUrl(field) {
  if (field.kind !== 'section' || !field.icon_path) return field

  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, field.icon_path)
  if (!signedUrl) return field
  return { ...field, icon_signed_url: signedUrl }
}

async function attachSectionIconUrls(fields) {
  return Promise.all((fields || []).map((field) => attachSectionIconUrl(field)))
}

export function normalizeDropdownOptions(options) {
  const list = Array.isArray(options) ? options : []
  const seen = new Set()
  const normalized = []
  for (const raw of list) {
    const value = String(raw ?? '').trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    normalized.push(value)
  }
  return normalized
}

function enrichFields(rows) {
  const list = rows || []
  const byId = new Map(list.map((row) => [row.id, row]))
  const childrenByParent = new Map()
  const parentsBySection = new Map()
  const childrenBySection = new Map()

  for (const row of list) {
    if (row.kind === 'child' && row.parent_id) {
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, [])
      childrenByParent.get(row.parent_id).push(row)
    }
    if (row.kind === 'parent' && row.section_id) {
      if (!parentsBySection.has(row.section_id)) parentsBySection.set(row.section_id, [])
      parentsBySection.get(row.section_id).push(row)
    }
  }

  for (const row of list) {
    if (row.kind !== 'child' || !row.parent_id) continue
    const parent = byId.get(row.parent_id)
    const sectionId = parent?.section_id
    if (!sectionId) continue
    if (!childrenBySection.has(sectionId)) childrenBySection.set(sectionId, [])
    childrenBySection.get(sectionId).push(row)
  }

  return list.map((row) => {
    const section = row.section_id ? byId.get(row.section_id) : null
    const parent = row.parent_id ? byId.get(row.parent_id) : null
    const sectionFromParent = parent?.section_id ? byId.get(parent.section_id) : null

    const children = row.kind === 'parent'
      ? (childrenByParent.get(row.id) || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      : []

    const dependsOnParent = row.depends_on_parent_id ? byId.get(row.depends_on_parent_id) : null
    const dependsOnSection = dependsOnParent?.section_id ? byId.get(dependsOnParent.section_id) : null

    const parentCount = row.kind === 'section'
      ? (parentsBySection.get(row.id) || []).length
      : undefined

    const childCount = row.kind === 'section'
      ? (childrenBySection.get(row.id) || []).length
      : row.kind === 'parent'
        ? children.length
        : undefined

    return {
      ...row,
      section_name: section?.name || sectionFromParent?.name || null,
      parent_name: parent?.name || null,
      parent_count: parentCount,
      child_count: childCount,
      dropdown_options: OPTION_FIELD_TYPES.has(row.field_type)
        ? children.map((c) => c.name)
        : undefined,
      option_bindings: OPTION_FIELD_TYPES.has(row.field_type)
        ? children.map((child) => ({
          value: child.name,
          parent_value: parseDependsOnOptions(child.depends_on_option)[0] || '',
        }))
        : undefined,
      depends_on_parent_name: dependsOnParent?.name || null,
      depends_on_section_name: dependsOnSection?.name || null,
    }
  })
}

async function fetchOrgFields(orgId) {
  const [equipmentResult, assetSectionsResult] = await Promise.all([
    supabaseAdmin
      .from('equipment_fields')
      .select('*')
      .eq('org_id', orgId)
      .order('sort_order')
      .order('name'),
    supabaseAdmin
      .from('asset_fields')
      .select('*')
      .eq('org_id', orgId)
      .eq('kind', 'section')
      .order('sort_order')
      .order('name'),
  ])

  if (equipmentResult.error) throw equipmentResult.error
  if (assetSectionsResult.error) throw assetSectionsResult.error

  const equipmentRows = (equipmentResult.data || []).filter((row) => row.kind !== 'section')
  const sections = assetSectionsResult.data || []
  return attachSectionIconUrls(enrichFields([...sections, ...equipmentRows]))
}

export async function loadOrgFields(orgId) {
  let fields = await fetchOrgFields(orgId)
  if (!fields.some((row) => row.kind === 'parent')) {
    const applied = await applyPlatformHierarchyDefault(orgId)
    if (applied?.applied) fields = await fetchOrgFields(orgId)
  }
  return fields
}

export async function getFieldById(orgId, id) {
  const fields = await loadOrgFields(orgId)
  return fields.find((row) => row.id === id) || null
}

function resolveKind(body) {
  if (body.is_section) return 'section'
  return 'parent'
}

function optionBindingKey(value, parentValue) {
  return `${String(parentValue || '').trim().toLowerCase()}::${String(value || '').trim().toLowerCase()}`
}

function storedParentValue(row) {
  return parseDependsOnOptions(row?.depends_on_option)[0] || ''
}

export function normalizeOptionBindings(bindings) {
  const seen = new Set()
  const out = []
  for (const raw of bindings || []) {
    const value = String(raw?.value ?? raw?.name ?? '').trim()
    const parentValue = String(raw?.parent_value ?? raw?.parentValue ?? '').trim()
    if (!value) continue
    const key = optionBindingKey(value, parentValue)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ value, parentValue })
  }
  return out
}

function entriesFromNames(names, existingRows) {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const entries = []
  const seen = new Set()
  for (const row of existingRows) {
    if (!wanted.has(row.name.toLowerCase())) continue
    const parentValue = storedParentValue(row)
    const key = optionBindingKey(row.name, parentValue)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ value: row.name, parentValue })
  }
  for (const value of names) {
    const already = entries.some((entry) => entry.value.toLowerCase() === value.toLowerCase())
    if (already) continue
    entries.push({ value, parentValue: '' })
  }
  return entries
}

export async function syncDropdownChildren(orgId, parentId, options, { bindings = null } = {}) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('equipment_fields')
    .select('id, name, depends_on_option')
    .eq('org_id', orgId)
    .eq('parent_id', parentId)
    .eq('kind', 'child')
  if (readError) throw readError

  const existingRows = existing || []
  const entries = Array.isArray(bindings)
    ? normalizeOptionBindings(bindings)
    : entriesFromNames(normalizeDropdownOptions(options), existingRows)
  const keptIds = new Set()

  for (let i = 0; i < entries.length; i++) {
    const { value, parentValue } = entries[i]
    const match = existingRows.find((row) => (
      !keptIds.has(row.id)
      && row.name.toLowerCase() === value.toLowerCase()
      && storedParentValue(row).toLowerCase() === parentValue.toLowerCase()
    )) || existingRows.find((row) => (
      !keptIds.has(row.id)
      && row.name.toLowerCase() === value.toLowerCase()
      && !storedParentValue(row)
    ))
    const stored = parentValue || null
    if (match) {
      keptIds.add(match.id)
      const { error } = await supabaseAdmin
        .from('equipment_fields')
        .update({
          name: value,
          sort_order: i,
          depends_on_option: stored,
          updated_at: new Date().toISOString(),
        })
        .eq('id', match.id)
        .eq('org_id', orgId)
      if (error) throw error
    } else {
      const { data, error } = await supabaseAdmin
        .from('equipment_fields')
        .insert({
          org_id: orgId,
          name: value,
          kind: 'child',
          parent_id: parentId,
          field_type: 'text',
          sort_order: i,
          depends_on_option: stored,
        })
        .select('id')
        .single()
      if (error) throw error
      keptIds.add(data.id)
    }
  }

  for (const row of existingRows) {
    if (!keptIds.has(row.id)) {
      const { error } = await supabaseAdmin
        .from('equipment_fields')
        .delete()
        .eq('id', row.id)
        .eq('org_id', orgId)
      if (error) throw error
    }
  }
}

export async function clearDropdownChildren(orgId, parentId) {
  await supabaseAdmin
    .from('equipment_fields')
    .delete()
    .eq('org_id', orgId)
    .eq('parent_id', parentId)
    .eq('kind', 'child')
}

async function validateFieldDependency(allFields, {
  fieldId = null,
  dependsOnParentId,
  dependsOnOption,
}) {
  const requestedOptions = parseDependsOnOptions(dependsOnOption)

  if (!dependsOnParentId && !requestedOptions.length) {
    return { depends_on_parent_id: null, depends_on_option: null }
  }

  if (!dependsOnParentId) {
    throw new Error('Select the previous level for this field')
  }

  if (fieldId && dependsOnParentId === fieldId) {
    throw new Error('A field cannot depend on itself')
  }

  const dependsOn = allFields.find((f) => f.id === dependsOnParentId)
  if (!dependsOn || dependsOn.kind !== 'parent') {
    throw new Error('Invalid previous level')
  }
  if (dependsOn.is_active === false) {
    throw new Error('The previous level is inactive')
  }

  let currentId = dependsOnParentId
  const visited = new Set(fieldId ? [fieldId] : [])
  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('Circular field dependency is not allowed')
    }
    visited.add(currentId)
    const node = allFields.find((f) => f.id === currentId)
    currentId = node?.depends_on_parent_id || null
  }

  if (!requestedOptions.length) {
    return { depends_on_parent_id: dependsOnParentId, depends_on_option: null }
  }

  const options = dependsOn.dropdown_options || []
  const resolved = []
  for (const option of requestedOptions) {
    const match = options.find((value) => value.toLowerCase() === option.toLowerCase())
    if (!match) throw new Error(`Invalid dependency option: ${option}`)
    resolved.push(match)
  }

  return {
    depends_on_parent_id: dependsOnParentId,
    depends_on_option: serializeDependsOnOptions(resolved),
  }
}

const EQUIPMENT_DETAILS_SECTION = 'Details'

async function ensureEquipmentDetailsSection(orgId) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('asset_fields')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', 'section')
    .eq('name', EQUIPMENT_DETAILS_SECTION)
    .limit(1)
    .maybeSingle()
  if (readError) throw readError
  if (existing?.id) return existing.id

  const { data: created, error } = await supabaseAdmin
    .from('asset_fields')
    .insert({
      org_id: orgId,
      name: EQUIPMENT_DETAILS_SECTION,
      kind: 'section',
      sort_order: 0,
      is_active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

function nextParentSortOrder(fields) {
  const orders = (fields || [])
    .filter((field) => field.kind === 'parent')
    .map((field) => field.sort_order ?? 0)
  if (!orders.length) return 0
  return Math.max(...orders) + 1
}

function normalizeSortOrder(value) {
  if (value === undefined || value === null || value === '') return 0
  const sortOrder = Number(value)
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Display order must be a whole number of 0 or greater')
  }
  return sortOrder
}

export async function validateFieldPayload(orgId, payload, { existingId = null, requireDropdownOptions = true } = {}) {
  const name = payload.name?.trim()
  if (!name) throw new Error('Name is required')

  const kind = payload.kind || resolveKind(payload)
  if (!KINDS.has(kind)) throw new Error('Invalid field kind')
  if (kind === 'child') throw new Error('Child values are added via dropdown options on a parent field')

  let sectionId = payload.section_id || null
  const parentId = null
  let fieldType = payload.field_type || null

  const allFields = await loadOrgFields(orgId)

  if (kind === 'section') {
    sectionId = null
    fieldType = null
  } else {
    if (!sectionId) {
      sectionId = await ensureEquipmentDetailsSection(orgId)
    } else {
      const section = allFields.find((f) => f.id === sectionId && f.kind === 'section')
      if (!section) throw new Error('Invalid section')
    }
    if (!fieldType || !FIELD_TYPES.has(fieldType)) {
      throw new Error('Field type is required')
    }
    if (OPTION_FIELD_TYPES.has(fieldType)) {
      const options = normalizeDropdownOptions(payload.dropdown_options)
      if (SINGLE_OPTION_FIELD_TYPES.has(fieldType) && requireDropdownOptions && !options.length) {
        throw new Error('Add at least one option value')
      }
    }
  }

  let dependency = { depends_on_parent_id: null, depends_on_option: null }
  if (kind === 'parent') {
    dependency = await validateFieldDependency(allFields, {
      fieldId: existingId,
      dependsOnParentId: payload.depends_on_parent_id || null,
      dependsOnOption: payload.depends_on_option || null,
    })
  }

  if (existingId) {
    const existing = allFields.find((f) => f.id === existingId)
    if (!existing) throw new Error('Field not found')
    if (existing.kind !== kind) {
      throw new Error('Field kind cannot be changed after creation')
    }
    if (kind === 'section') {
      const hasChildren = allFields.some((f) => f.section_id === existingId || (
        f.parent_id && allFields.find((p) => p.id === f.parent_id)?.section_id === existingId
      ))
      if (hasChildren && payload.is_active === false) {
        throw new Error('Cannot deactivate a section that has fields')
      }
    }
    if (kind === 'parent') {
      const hasChildren = allFields.some((f) => f.parent_id === existingId)
      if (hasChildren && payload.is_active === false) {
        throw new Error('Cannot deactivate a parent field that has option values')
      }
    }
  }

  const sortOrder = payload.sort_order === undefined && !existingId
    ? nextParentSortOrder(allFields)
    : normalizeSortOrder(payload.sort_order)

  return {
    name,
    kind,
    section_id: sectionId,
    parent_id: parentId,
    field_type: fieldType,
    sort_order: sortOrder,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    is_required: kind === 'parent' ? Boolean(payload.is_required) : false,
    icon_path: kind === 'section' && payload.icon_path !== undefined ? payload.icon_path : undefined,
    dropdown_options: OPTION_FIELD_TYPES.has(fieldType) ? normalizeDropdownOptions(payload.dropdown_options) : [],
    ...dependency,
  }
}

async function reassignSortOrder(orgId, ids, kind) {
  const now = new Date().toISOString()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabaseAdmin
      .from('equipment_fields')
      .update({ sort_order: i, updated_at: now })
      .eq('id', ids[i])
      .eq('org_id', orgId)
      .eq('kind', kind)
    if (error) throw error
  }
}

async function reassignSectionSortOrder(orgId, ids) {
  await reassignSortOrder(orgId, ids, 'section')
}

export async function validateDeactivate(orgId, existing, isActive) {
  if (isActive !== false) return
  const allFields = await loadOrgFields(orgId)
  if (existing.kind === 'section') {
    const hasChildren = allFields.some((f) => f.section_id === existing.id || (
      f.parent_id && allFields.find((p) => p.id === f.parent_id)?.section_id === existing.id
    ))
    if (hasChildren) throw new Error('Remove or delete fields from this section first')
  }
  if (existing.kind === 'parent') {
    const hasChildren = allFields.some((f) => f.parent_id === existing.id)
    if (hasChildren) throw new Error('Remove or delete option values from this parent first')
  }
}

export function isActiveOnlyUpdate(body) {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined)
  return keys.length === 1 && keys[0] === 'is_active'
}

export function isDropdownValuesOnlyUpdate(body) {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined)
  return keys.length === 1 && keys[0] === 'dropdown_options'
}

export async function assertDropdownOptionsRemovable(orgId, parentId, newOptions) {
  const allFields = await loadOrgFields(orgId)
  const normalized = normalizeDropdownOptions(newOptions)
  const dependents = allFields.filter((f) => f.depends_on_parent_id === parentId && f.id !== parentId)
  for (const dep of dependents) {
    const depOptions = parseDependsOnOptions(dep.depends_on_option)
    for (const option of depOptions) {
      if (!normalized.some((o) => o.toLowerCase() === option.toLowerCase())) {
        throw new Error(`Cannot remove "${option}" — "${dep.name}" depends on it`)
      }
    }
    for (const binding of dep.option_bindings || []) {
      const parentValue = String(binding.parent_value || '').trim()
      if (!parentValue) continue
      if (!normalized.some((option) => option.toLowerCase() === parentValue.toLowerCase())) {
        throw new Error(`Cannot remove "${parentValue}" — "${dep.name}" uses it for "${binding.value}"`)
      }
    }
  }
}

async function assertLevelOptionBindings(orgId, parentFieldId, entries) {
  const tagged = entries.filter((entry) => entry.parentValue)
  if (!tagged.length) return
  const allFields = await loadOrgFields(orgId)
  const parent = allFields.find((field) => field.id === parentFieldId && field.kind === 'parent')
  if (!parent) throw new Error('Invalid previous level')
  const allowed = parent.dropdown_options || []
  if (!SINGLE_OPTION_FIELD_TYPES.has(parent.field_type) || !allowed.length) {
    for (const entry of entries) entry.parentValue = ''
    return
  }
  for (const entry of tagged) {
    const match = allowed.find((value) => value.toLowerCase() === entry.parentValue.toLowerCase())
    if (!match) throw new Error(`"${entry.parentValue}" is not an option on ${parent.name}`)
    entry.parentValue = match
  }
}

async function persistFieldOptions(orgId, fieldId, { fieldType, dropdownOptions, bindings, dependsOnParentId }) {
  if (!OPTION_FIELD_TYPES.has(fieldType)) return
  const entries = Array.isArray(bindings) ? normalizeOptionBindings(bindings) : null
  if (entries && !entries.length) {
    await clearDropdownChildren(orgId, fieldId)
    return
  }
  if (dependsOnParentId && entries?.length) {
    await assertLevelOptionBindings(orgId, dependsOnParentId, entries)
    const names = [...new Set(entries.map((entry) => entry.value))]
    if (names.length) await assertDropdownOptionsRemovable(orgId, fieldId, names)
    await syncDropdownChildren(orgId, fieldId, null, { bindings: entries })
    return
  }
  const names = entries
    ? [...new Set(entries.map((entry) => entry.value))]
    : normalizeDropdownOptions(dropdownOptions)
  if (names.length) await assertDropdownOptionsRemovable(orgId, fieldId, names)
  if (entries) {
    await syncDropdownChildren(orgId, fieldId, null, { bindings: entries })
  } else if (names.length) {
    await syncDropdownChildren(orgId, fieldId, names)
  }
}

export async function createEquipmentField(orgId, body) {
  const kind = body.kind || (body.is_section ? 'section' : 'parent')
  // Sections are shared with Assets and live in asset_fields.
  if (kind === 'section' || body.is_section) {
    return createAssetField(orgId, { ...body, is_section: true, is_parent: false })
  }

  const payload = await validateFieldPayload(orgId, body, { requireDropdownOptions: false })
  // option values are derived from child rows — never a DB column
  const { icon_path: iconPath, dropdown_options: dropdownOptions, ...insertPayload } = payload

  // Avoid INSERT ... RETURNING here. Under RLS, PostgREST can reject the
  // representation even after the insert succeeds, leaving the UI reporting
  // a failure for a row that was actually created.
  const id = randomUUID()
  const row = { id, org_id: orgId, ...insertPayload }
  if (iconPath !== undefined) row.icon_path = iconPath

  const { error } = await supabaseAdmin
    .from('equipment_fields')
    .insert(row)

  if (error) throw error

  if (OPTION_FIELD_TYPES.has(insertPayload.field_type) && (dropdownOptions?.length || body.option_bindings)) {
    await persistFieldOptions(orgId, id, {
      fieldType: insertPayload.field_type,
      dropdownOptions,
      bindings: body.option_bindings,
      dependsOnParentId: insertPayload.depends_on_parent_id,
    })
  }

  invalidateOrgFormCaches(orgId)
  const created = await getFieldById(orgId, id)
  await appendFieldToSavedEquipmentForm(orgId, created)
  return created
}

export async function updateEquipmentFieldActive(orgId, id, isActive) {
  const existing = await getFieldById(orgId, id)
  if (!existing) throw Object.assign(new Error('Field not found'), { status: 404 })

  if (existing.kind === 'section') {
    return updateAssetFieldActive(orgId, id, isActive)
  }

  await validateDeactivate(orgId, existing, isActive)
  const { error } = await supabaseAdmin
    .from('equipment_fields')
    .update({
      is_active: Boolean(isActive),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
  if (error) throw error
  return getFieldById(orgId, id)
}

export async function updateEquipmentFieldDropdownValues(orgId, id, dropdownOptions) {
  const existing = await getFieldById(orgId, id)
  if (!existing) throw Object.assign(new Error('Field not found'), { status: 404 })
  if (existing.kind !== 'parent' || !OPTION_FIELD_TYPES.has(existing.field_type)) {
    throw new Error('Option values can only be set on option-backed parent fields')
  }

  const options = normalizeDropdownOptions(dropdownOptions)
  if (!options.length) throw new Error('Add at least one option value')

  await assertDropdownOptionsRemovable(orgId, id, options)
  await syncDropdownChildren(orgId, id, options)
  return getFieldById(orgId, id)
}

export async function updateEquipmentFieldSchema(orgId, id, body) {
  const existing = await getFieldById(orgId, id)
  if (!existing) throw Object.assign(new Error('Field not found'), { status: 404 })
  if (existing.kind === 'child') {
    throw new Error('Edit option values from the parent field')
  }

  if (existing.kind === 'section') {
    return updateAssetFieldSchema(orgId, id, body)
  }

  const payload = await validateFieldPayload(orgId, {
    ...body,
    name: body.name ?? existing.name,
    field_type: body.field_type ?? existing.field_type,
    kind: existing.kind,
    is_section: false,
    section_id: body.section_id ?? existing.section_id,
    dropdown_options: body.dropdown_options ?? existing.dropdown_options,
    is_required: body.is_required !== undefined ? body.is_required : existing.is_required,
    depends_on_parent_id: body.depends_on_parent_id !== undefined
      ? body.depends_on_parent_id
      : existing.depends_on_parent_id,
    depends_on_option: body.depends_on_option !== undefined
      ? body.depends_on_option
      : existing.depends_on_option,
  }, { existingId: id, requireDropdownOptions: false })

  const { icon_path: iconPath, ...updatePayload } = payload

  const updates = {
    name: updatePayload.name,
    section_id: updatePayload.section_id,
    parent_id: updatePayload.parent_id,
    field_type: updatePayload.field_type,
    is_required: updatePayload.is_required,
    depends_on_parent_id: updatePayload.depends_on_parent_id,
    depends_on_option: updatePayload.depends_on_option,
    sort_order: body.sort_order !== undefined ? updatePayload.sort_order : existing.sort_order,
    updated_at: new Date().toISOString(),
  }
  if (body.is_active !== undefined) updates.is_active = updatePayload.is_active
  if (existing.kind === 'section' && body.icon_path !== undefined) {
    updates.icon_path = body.icon_path
  }

  const { error } = await supabaseAdmin
    .from('equipment_fields')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) throw error

  if (existing.kind === 'parent' && OPTION_FIELD_TYPES.has(existing.field_type) && !OPTION_FIELD_TYPES.has(updates.field_type)) {
    await clearDropdownChildren(orgId, id)
  } else if (
    existing.kind === 'parent'
    && OPTION_FIELD_TYPES.has(updates.field_type)
    && (body.dropdown_options !== undefined || body.option_bindings !== undefined)
  ) {
    await persistFieldOptions(orgId, id, {
      fieldType: updates.field_type,
      dropdownOptions: body.dropdown_options,
      bindings: body.option_bindings,
      dependsOnParentId: updates.depends_on_parent_id,
    })
  }

  invalidateOrgFormCaches(orgId)
  return getFieldById(orgId, id)
}

export async function deleteEquipmentField(orgId, id) {
  const existing = await getFieldById(orgId, id)
  if (!existing) throw Object.assign(new Error('Field not found'), { status: 404 })

  if (existing.kind === 'section') {
    const allFields = await loadOrgFields(orgId)
    const hasLinked = allFields.some((f) => (
      f.kind !== 'section' && (
        f.section_id === existing.id
        || (f.parent_id && allFields.find((p) => p.id === f.parent_id)?.section_id === existing.id)
      )
    ))
    if (hasLinked) {
      throw new Error('Remove fields from this section first')
    }
    return deleteAssetField(orgId, id)
  }

  if (existing.kind === 'parent') {
    const allFields = await loadOrgFields(orgId)
    const dependents = allFields.filter((f) => f.depends_on_parent_id === existing.id)
    if (dependents.length) {
      const names = dependents.map((f) => f.name).join(', ')
      throw Object.assign(new Error(`Cannot delete this field — ${names} depend on it`), { status: 400 })
    }
    await clearDropdownChildren(orgId, existing.id)
  }

  await removeFieldFromSavedEquipmentForm(orgId, existing.id)

  const { error } = await supabaseAdmin
    .from('equipment_fields')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) throw error
  invalidateOrgFormCaches(orgId)
  return { id, deleted: true }
}

export async function reorderEquipmentSections(orgId, ids) {
  await reorderAssetSections(orgId, ids)
  return loadOrgFields(orgId)
}

export async function reorderEquipmentParents(orgId, sectionId, ids) {
  if (!sectionId) throw new Error('section_id is required')
  if (!Array.isArray(ids) || !ids.length) {
    throw new Error('ids array is required')
  }

  const allFields = await loadOrgFields(orgId)
  const section = allFields.find((field) => field.id === sectionId && field.kind === 'section')
  if (!section) throw new Error('Section not found')

  const parents = allFields.filter((field) => field.kind === 'parent' && field.section_id === sectionId)
  if (ids.length !== parents.length) {
    throw new Error('Reorder must include all parent fields in the section')
  }

  const known = new Set(parents.map((parent) => parent.id))
  if (ids.some((fieldId) => !known.has(fieldId))) {
    throw new Error('Invalid parent id in order')
  }

  await reassignSortOrder(orgId, ids, 'parent')
  return loadOrgFields(orgId)
}
