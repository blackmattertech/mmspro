import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireOrgRole } from '../../middleware/orgRole.js'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()
const canManage = requireOrgRole('owner', 'admin')

router.use(verifyAuth, requireOrgAccess)

const FIELD_TYPES = new Set([
  'text', 'textarea', 'number', 'date', 'datetime', 'image', 'file', 'checkbox', 'dropdown',
])

const KINDS = new Set(['section', 'parent', 'child'])
const ORG_ASSETS_BUCKET = 'org-assets'

async function attachSectionIconUrl(field) {
  if (field.kind !== 'section' || !field.icon_path) return field

  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(field.icon_path, 3600)

  if (error || !data?.signedUrl) return field
  return { ...field, icon_signed_url: data.signedUrl }
}

async function attachSectionIconUrls(fields) {
  return Promise.all((fields || []).map((field) => attachSectionIconUrl(field)))
}

function normalizeDropdownOptions(options) {
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
  const byId = new Map((rows || []).map((row) => [row.id, row]))

  return (rows || []).map((row) => {
    const section = row.section_id ? byId.get(row.section_id) : null
    const parent = row.parent_id ? byId.get(row.parent_id) : null
    const sectionFromParent = parent?.section_id ? byId.get(parent.section_id) : null

    const children = row.kind === 'parent'
      ? rows.filter((f) => f.parent_id === row.id && f.kind === 'child')
      : []

    const dependsOnParent = row.depends_on_parent_id ? byId.get(row.depends_on_parent_id) : null
    const dependsOnSection = dependsOnParent?.section_id ? byId.get(dependsOnParent.section_id) : null

    const parentCount = row.kind === 'section'
      ? rows.filter((f) => f.section_id === row.id && f.kind === 'parent').length
      : undefined

    const childCount = row.kind === 'section'
      ? rows.filter((f) => {
        const p = f.parent_id ? byId.get(f.parent_id) : null
        return f.kind === 'child' && p?.section_id === row.id
      }).length
      : row.kind === 'parent'
        ? children.length
        : undefined

    return {
      ...row,
      section_name: section?.name || sectionFromParent?.name || null,
      parent_name: parent?.name || null,
      parent_count: parentCount,
      child_count: childCount,
      dropdown_options: row.field_type === 'dropdown'
        ? children.map((c) => c.name)
        : undefined,
      depends_on_parent_name: dependsOnParent?.name || null,
      depends_on_section_name: dependsOnSection?.name || null,
    }
  })
}

async function loadOrgFields(orgId) {
  const { data, error } = await supabaseAdmin
    .from('asset_fields')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('name')

  if (error) throw error
  return attachSectionIconUrls(enrichFields(data || []))
}

async function getFieldById(orgId, id) {
  const fields = await loadOrgFields(orgId)
  return fields.find((row) => row.id === id) || null
}

function resolveKind(body) {
  if (body.is_section) return 'section'
  return 'parent'
}

async function syncDropdownChildren(orgId, parentId, options) {
  const normalized = normalizeDropdownOptions(options)

  const { data: existing } = await supabaseAdmin
    .from('asset_fields')
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
        .from('asset_fields')
        .update({ name, sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('org_id', orgId)
    } else {
      const { data, error } = await supabaseAdmin
        .from('asset_fields')
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
      await supabaseAdmin.from('asset_fields').delete().eq('id', row.id).eq('org_id', orgId)
    }
  }
}

async function clearDropdownChildren(orgId, parentId) {
  await supabaseAdmin
    .from('asset_fields')
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
  if (!dependsOnParentId && !dependsOnOption) {
    return { depends_on_parent_id: null, depends_on_option: null }
  }

  if (!dependsOnParentId || !dependsOnOption?.trim()) {
    throw new Error('Select both a parent field and option for the dependency')
  }

  if (fieldId && dependsOnParentId === fieldId) {
    throw new Error('A field cannot depend on itself')
  }

  const dependsOn = allFields.find((f) => f.id === dependsOnParentId)
  if (!dependsOn || dependsOn.kind !== 'parent') {
    throw new Error('Invalid dependency field')
  }
  if (dependsOn.field_type !== 'dropdown') {
    throw new Error('Dependencies must reference a dropdown parent field')
  }
  if (dependsOn.is_active === false) {
    throw new Error('Dependency field is inactive')
  }

  const option = dependsOnOption.trim()
  const options = dependsOn.dropdown_options || []
  if (!options.some((value) => value.toLowerCase() === option.toLowerCase())) {
    throw new Error('Invalid dependency option')
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
    depends_on_option: options.find((value) => value.toLowerCase() === option.toLowerCase()) || option,
  }
}

async function validateFieldPayload(orgId, payload, { existingId = null } = {}) {
  const name = payload.name?.trim()
  if (!name) throw new Error('Name is required')

  const kind = payload.kind || resolveKind(payload)
  if (!KINDS.has(kind)) throw new Error('Invalid field kind')
  if (kind === 'child') throw new Error('Child values are added via dropdown options on a parent field')

  let sectionId = payload.section_id || null
  let parentId = null
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
    if (fieldType === 'dropdown') {
      const options = normalizeDropdownOptions(payload.dropdown_options)
      if (!options.length) throw new Error('Add at least one dropdown value')
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
        throw new Error('Cannot deactivate a parent field that has dropdown values')
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
    icon_path: kind === 'section' && payload.icon_path !== undefined ? payload.icon_path : undefined,
    dropdown_options: fieldType === 'dropdown' ? normalizeDropdownOptions(payload.dropdown_options) : [],
    ...dependency,
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

async function reassignSectionSortOrder(orgId, ids) {
  const now = new Date().toISOString()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabaseAdmin
      .from('asset_fields')
      .update({ sort_order: i, updated_at: now })
      .eq('id', ids[i])
      .eq('org_id', orgId)
      .eq('kind', 'section')
    if (error) throw error
  }
}

router.get('/fields', async (req, res) => {
  try {
    const fields = await loadOrgFields(req.userProfile.org_id)
    res.json(fields)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/fields/reorder', canManage, async (req, res) => {
  const orgId = req.userProfile.org_id
  const { kind, ids } = req.body

  if (kind !== 'section') {
    return res.status(400).json({ error: 'kind must be "section"' })
  }
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' })
  }

  try {
    const allFields = await loadOrgFields(orgId)
    const sections = allFields.filter((field) => field.kind === 'section')
    if (ids.length !== sections.length) {
      return res.status(400).json({ error: 'Reorder must include all sections' })
    }

    const known = new Set(sections.map((section) => section.id))
    if (ids.some((id) => !known.has(id))) {
      return res.status(400).json({ error: 'Invalid section id in order' })
    }

    await reassignSectionSortOrder(orgId, ids)
    const fields = await loadOrgFields(orgId)
    res.json(fields)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/fields/:id', assertOrgOwnership('asset_fields'), async (req, res) => {
  try {
    const field = await getFieldById(req.userProfile.org_id, req.params.id)
    if (!field) return res.status(404).json({ error: 'Field not found' })
    res.json(field)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/fields', canManage, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const payload = await validateFieldPayload(orgId, req.body)
    const { dropdown_options: options, icon_path: iconPath, ...insertPayload } = payload

    const row = { org_id: orgId, ...insertPayload }
    if (iconPath !== undefined) row.icon_path = iconPath

    const { data, error } = await supabaseAdmin
      .from('asset_fields')
      .insert(row)
      .select('*')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    if (data.kind === 'parent' && data.field_type === 'dropdown') {
      await syncDropdownChildren(orgId, data.id, options)
    }

    const field = await getFieldById(orgId, data.id)
    res.status(201).json(field)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

async function validateDeactivate(orgId, existing, isActive) {
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
    if (hasChildren) throw new Error('Remove or delete dropdown values from this parent first')
  }
}

function isActiveOnlyUpdate(body) {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined)
  return keys.length === 1 && keys[0] === 'is_active'
}

router.patch('/fields/:id', canManage, assertOrgOwnership('asset_fields'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (isActiveOnlyUpdate(req.body)) {
      await validateDeactivate(orgId, existing, req.body.is_active)
      const { error } = await supabaseAdmin
        .from('asset_fields')
        .update({
          is_active: Boolean(req.body.is_active),
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id)
        .eq('org_id', orgId)
      if (error) return res.status(500).json({ error: error.message })
      const field = await getFieldById(orgId, req.params.id)
      return res.json(field)
    }

    if (existing.kind === 'child') {
      return res.status(400).json({ error: 'Edit dropdown values from the parent field' })
    }

    const payload = await validateFieldPayload(orgId, {
      ...req.body,
      name: req.body.name ?? existing.name,
      field_type: req.body.field_type ?? existing.field_type,
      kind: existing.kind,
      is_section: existing.kind === 'section',
      section_id: existing.kind === 'parent' ? (req.body.section_id ?? existing.section_id) : null,
      dropdown_options: req.body.dropdown_options ?? existing.dropdown_options,
      depends_on_parent_id: req.body.depends_on_parent_id !== undefined
        ? req.body.depends_on_parent_id
        : existing.depends_on_parent_id,
      depends_on_option: req.body.depends_on_option !== undefined
        ? req.body.depends_on_option
        : existing.depends_on_option,
    }, { existingId: req.params.id })

    const { dropdown_options: options, icon_path: iconPath, ...updatePayload } = payload

    const updates = {
      name: updatePayload.name,
      section_id: updatePayload.section_id,
      parent_id: updatePayload.parent_id,
      field_type: updatePayload.field_type,
      depends_on_parent_id: updatePayload.depends_on_parent_id,
      depends_on_option: updatePayload.depends_on_option,
      sort_order: req.body.sort_order !== undefined ? updatePayload.sort_order : existing.sort_order,
      updated_at: new Date().toISOString(),
    }
    if (req.body.is_active !== undefined) updates.is_active = updatePayload.is_active
    if (existing.kind === 'section' && req.body.icon_path !== undefined) {
      updates.icon_path = req.body.icon_path
    }

    const { error } = await supabaseAdmin
      .from('asset_fields')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', orgId)

    if (error) return res.status(500).json({ error: error.message })

    if (existing.kind === 'parent') {
      if (updates.field_type === 'dropdown') {
        const allFields = await loadOrgFields(orgId)
        const newOptions = normalizeDropdownOptions(options)
        const dependents = allFields.filter((f) => f.depends_on_parent_id === existing.id && f.id !== existing.id)
        for (const dep of dependents) {
          if (dep.depends_on_option && !newOptions.some((o) => o.toLowerCase() === dep.depends_on_option.toLowerCase())) {
            throw new Error(`Cannot remove "${dep.depends_on_option}" — "${dep.name}" depends on it`)
          }
        }
        await syncDropdownChildren(orgId, req.params.id, options)
      } else if (existing.field_type === 'dropdown') {
        await clearDropdownChildren(orgId, req.params.id)
      }
    }

    const field = await getFieldById(orgId, req.params.id)
    res.json(field)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/fields/:id', canManage, assertOrgOwnership('asset_fields'), async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const existing = await getFieldById(orgId, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Field not found' })

    if (existing.kind === 'section') {
      const allFields = await loadOrgFields(orgId)
      const hasLinked = allFields.some((f) => f.section_id === existing.id || (
        f.parent_id && allFields.find((p) => p.id === f.parent_id)?.section_id === existing.id
      ))
      if (hasLinked) {
        return res.status(400).json({ error: 'Remove fields from this section first' })
      }
      if (existing.icon_path) {
        await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).remove([existing.icon_path])
      }
    }
    if (existing.kind === 'parent') {
      const allFields = await loadOrgFields(orgId)
      const dependents = allFields.filter((f) => f.depends_on_parent_id === existing.id)
      if (dependents.length) {
        const names = dependents.map((f) => f.name).join(', ')
        return res.status(400).json({
          error: `Cannot delete this field — ${names} depend on it`,
        })
      }
      await clearDropdownChildren(orgId, existing.id)
    }

    const { error } = await supabaseAdmin
      .from('asset_fields')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', orgId)

    if (error) return res.status(500).json({ error: error.message })
    res.json({ id: req.params.id, deleted: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
