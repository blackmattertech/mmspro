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
      depends_on_parent_name: dependsOnParent?.name || null,
      depends_on_section_name: dependsOnSection?.name || null,
    }
  })
}

export async function loadOrgFields(orgId) {
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

  // Equipment and assets share the same sections (stored in asset_fields).
  const equipmentRows = (equipmentResult.data || []).filter((row) => row.kind !== 'section')
  const sections = assetSectionsResult.data || []
  return attachSectionIconUrls(enrichFields([...sections, ...equipmentRows]))
}

export async function getFieldById(orgId, id) {
  const fields = await loadOrgFields(orgId)
  return fields.find((row) => row.id === id) || null
}

function resolveKind(body) {
  if (body.is_section) return 'section'
  return 'parent'
}

export async function syncDropdownChildren(orgId, parentId, options) {
  const normalized = normalizeDropdownOptions(options)

  const { data: existing } = await supabaseAdmin
    .from('equipment_fields')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('parent_id', parentId)
    .eq('kind', 'child')

  const existingRows = existing || []
  const keptIds = new Set()

  for (let i = 0; i < normalized.length; i++) {
    const name = normalized[i]
    const match = existingRows.find((row) => row.name.toLowerCase() === name.toLowerCase())
    if (match) {
      keptIds.add(match.id)
      await supabaseAdmin
        .from('equipment_fields')
        .update({ name, sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('org_id', orgId)
    } else {
      const { data, error } = await supabaseAdmin
        .from('equipment_fields')
        .insert({
          org_id: orgId,
          name,
          kind: 'child',
          parent_id: parentId,
          field_type: 'text',
          sort_order: i,
        })
        .select('id')
        .single()
      if (error) throw error
      keptIds.add(data.id)
    }
  }

  for (const row of existingRows) {
    if (!keptIds.has(row.id)) {
      await supabaseAdmin.from('equipment_fields').delete().eq('id', row.id).eq('org_id', orgId)
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

  if (!dependsOnParentId || !requestedOptions.length) {
    throw new Error('Select both a parent field and at least one child value for the dependency')
  }

  if (fieldId && dependsOnParentId === fieldId) {
    throw new Error('A field cannot depend on itself')
  }

  const dependsOn = allFields.find((f) => f.id === dependsOnParentId)
  if (!dependsOn || dependsOn.kind !== 'parent') {
    throw new Error('Invalid dependency field')
  }
  if (!OPTION_FIELD_TYPES.has(dependsOn.field_type)) {
    throw new Error('Dependencies must reference a parent field with child values')
  }
  if (dependsOn.is_active === false) {
    throw new Error('Dependency field is inactive')
  }

  const options = dependsOn.dropdown_options || []
  const resolved = []
  for (const option of requestedOptions) {
    const match = options.find((value) => value.toLowerCase() === option.toLowerCase())
    if (!match) throw new Error(`Invalid dependency option: ${option}`)
    resolved.push(match)
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

  return {
    depends_on_parent_id: dependsOnParentId,
    depends_on_option: serializeDependsOnOptions(resolved),
  }
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
    if (!sectionId) throw new Error('Section is required for a parent field')
    const section = allFields.find((f) => f.id === sectionId && f.kind === 'section')
    if (!section) throw new Error('Invalid section')
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

  return {
    name,
    kind,
    section_id: sectionId,
    parent_id: parentId,
    field_type: fieldType,
    sort_order: normalizeSortOrder(payload.sort_order),
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

  if (OPTION_FIELD_TYPES.has(insertPayload.field_type) && dropdownOptions?.length) {
    await syncDropdownChildren(orgId, id, dropdownOptions)
  }

  return getFieldById(orgId, id)
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
    && body.dropdown_options !== undefined
  ) {
    const options = normalizeDropdownOptions(body.dropdown_options)
    if (options.length) {
      await assertDropdownOptionsRemovable(orgId, id, options)
      await syncDropdownChildren(orgId, id, options)
    }
  }

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

  const { error } = await supabaseAdmin
    .from('equipment_fields')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) throw error
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
