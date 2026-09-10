import { supabaseAdmin } from '../services/supabase.js'
import {
  CHECKLIST_FIELD_TYPES,
  OPTION_CHECKLIST_FIELD_TYPES,
} from './pmConstants.js'

const TEMPLATE_SELECT = `
  id, org_id, name, description, version, is_active,
  created_by, updated_by, created_at, updated_at
`

const SECTION_SELECT = `
  id, org_id, template_id, name, sort_order, created_at, updated_at
`

const FIELD_SELECT = `
  id, org_id, template_id, section_id, name, field_type, options, is_required, sort_order,
  created_at, updated_at
`

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
}

export async function bumpChecklistVersion(orgId, templateId, profileId) {
  const { data: row, error } = await supabaseAdmin
    .from('checklist_templates')
    .select('version')
    .eq('org_id', orgId)
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw httpError('Checklist template not found.', 404)

  const { error: updateError } = await supabaseAdmin
    .from('checklist_templates')
    .update({
      version: (row.version || 1) + 1,
      updated_by: profileId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .eq('org_id', orgId)

  if (updateError) throw updateError
}

async function loadSections(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('checklist_template_sections')
    .select(SECTION_SELECT)
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    // Table may not exist until patch 74 is applied
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) return []
    throw error
  }
  return data || []
}

async function loadFields(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('checklist_template_fields')
    .select(FIELD_SELECT)
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    // Fallback if section_id column not yet applied
    if (/section_id/i.test(error.message || '')) {
      const { data: legacy, error: legacyError } = await supabaseAdmin
        .from('checklist_template_fields')
        .select(`
          id, org_id, template_id, name, field_type, options, is_required, sort_order,
          created_at, updated_at
        `)
        .eq('org_id', orgId)
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (legacyError) throw legacyError
      return (legacy || []).map((row) => ({ ...row, section_id: null }))
    }
    throw error
  }
  return data || []
}

function attachSectionsAndFields(template, sections, fields) {
  const fieldsBySection = new Map()
  const unsectioned = []
  for (const field of fields) {
    if (field.section_id) {
      const list = fieldsBySection.get(field.section_id) || []
      list.push(field)
      fieldsBySection.set(field.section_id, list)
    } else {
      unsectioned.push(field)
    }
  }

  return {
    ...template,
    sections: sections.map((section) => ({
      ...section,
      fields: fieldsBySection.get(section.id) || [],
      field_count: (fieldsBySection.get(section.id) || []).length,
    })),
    fields,
    unsectioned_fields: unsectioned,
  }
}

export async function listChecklistTemplates(orgId, { includeInactive = false } = {}) {
  let query = supabaseAdmin
    .from('checklist_templates')
    .select(TEMPLATE_SELECT)
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error

  const templates = data || []
  if (!templates.length) return []

  const ids = templates.map((row) => row.id)
  const { data: fields, error: fieldsError } = await supabaseAdmin
    .from('checklist_template_fields')
    .select('template_id')
    .eq('org_id', orgId)
    .in('template_id', ids)

  if (fieldsError) throw fieldsError

  let sectionCounts = new Map()
  try {
    const { data: sections, error: sectionsError } = await supabaseAdmin
      .from('checklist_template_sections')
      .select('template_id')
      .eq('org_id', orgId)
      .in('template_id', ids)
    if (!sectionsError) {
      for (const section of sections || []) {
        sectionCounts.set(section.template_id, (sectionCounts.get(section.template_id) || 0) + 1)
      }
    }
  } catch {
    sectionCounts = new Map()
  }

  const counts = new Map()
  for (const field of fields || []) {
    counts.set(field.template_id, (counts.get(field.template_id) || 0) + 1)
  }

  return templates.map((row) => ({
    ...row,
    field_count: counts.get(row.id) || 0,
    section_count: sectionCounts.get(row.id) || 0,
  }))
}

export async function getChecklistTemplate(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('checklist_templates')
    .select(TEMPLATE_SELECT)
    .eq('org_id', orgId)
    .eq('id', templateId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw httpError('Checklist template not found.', 404)

  const [sections, fields] = await Promise.all([
    loadSections(orgId, templateId),
    loadFields(orgId, templateId),
  ])
  return attachSectionsAndFields(data, sections, fields)
}

export async function createChecklistTemplate(orgId, profileId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Checklist name is required.')

  const { data, error } = await supabaseAdmin
    .from('checklist_templates')
    .insert({
      org_id: orgId,
      name,
      description: String(body.description || '').trim() || null,
      is_active: body.is_active !== false,
      version: 1,
      created_by: profileId || null,
      updated_by: profileId || null,
    })
    .select(TEMPLATE_SELECT)
    .single()

  if (error) throw error
  return attachSectionsAndFields(data, [], [])
}

export async function updateChecklistTemplate(orgId, profileId, templateId, body = {}) {
  const existing = await getChecklistTemplate(orgId, templateId)
  const patch = {
    updated_by: profileId || null,
    updated_at: new Date().toISOString(),
  }
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) throw httpError('Checklist name is required.')
    patch.name = name
  }
  if (body.description !== undefined) {
    patch.description = String(body.description || '').trim() || null
  }
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)

  const { data, error } = await supabaseAdmin
    .from('checklist_templates')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', templateId)
    .select(TEMPLATE_SELECT)
    .single()

  if (error) throw error
  return attachSectionsAndFields(data, existing.sections || [], existing.fields || [])
}

export async function deleteChecklistTemplate(orgId, templateId) {
  const { count, error: countError } = await supabaseAdmin
    .from('pm_plans')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('checklist_template_id', templateId)

  if (countError) throw countError
  if (count) {
    throw httpError('This checklist is assigned to one or more PM plans. Unassign it first.', 409)
  }

  const { error } = await supabaseAdmin
    .from('checklist_templates')
    .delete()
    .eq('org_id', orgId)
    .eq('id', templateId)

  if (error) throw error
}

export async function createChecklistSection(orgId, profileId, templateId, body = {}) {
  await getChecklistTemplate(orgId, templateId)
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Section name is required.')

  const { data: last } = await supabaseAdmin
    .from('checklist_template_sections')
    .select('sort_order')
    .eq('template_id', templateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabaseAdmin
    .from('checklist_template_sections')
    .insert({
      org_id: orgId,
      template_id: templateId,
      name,
      sort_order: body.sort_order != null
        ? Number(body.sort_order) || 0
        : (last?.sort_order || 0) + 10,
    })
    .select(SECTION_SELECT)
    .single()

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
  return { ...data, fields: [], field_count: 0 }
}

export async function updateChecklistSection(orgId, profileId, templateId, sectionId, body = {}) {
  const { data: existing, error: findError } = await supabaseAdmin
    .from('checklist_template_sections')
    .select(SECTION_SELECT)
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .eq('id', sectionId)
    .maybeSingle()

  if (findError) throw findError
  if (!existing) throw httpError('Section not found.', 404)

  const patch = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) throw httpError('Section name is required.')
    patch.name = name
  }
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0

  const { data, error } = await supabaseAdmin
    .from('checklist_template_sections')
    .update(patch)
    .eq('id', sectionId)
    .eq('org_id', orgId)
    .select(SECTION_SELECT)
    .single()

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
  return data
}

export async function deleteChecklistSection(orgId, profileId, templateId, sectionId) {
  const { error } = await supabaseAdmin
    .from('checklist_template_sections')
    .delete()
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .eq('id', sectionId)

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
}

export async function reorderChecklistSections(orgId, profileId, templateId, sectionIds = []) {
  if (!Array.isArray(sectionIds) || !sectionIds.length) {
    throw httpError('Section order is required.')
  }

  const updates = sectionIds.map((id, index) => (
    supabaseAdmin
      .from('checklist_template_sections')
      .update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .eq('id', id)
  ))

  const results = await Promise.all(updates)
  const failed = results.find((row) => row.error)
  if (failed?.error) throw failed.error

  await bumpChecklistVersion(orgId, templateId, profileId)
  return getChecklistTemplate(orgId, templateId)
}

function normalizeFieldPayload(body) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Field name is required.')
  const fieldType = String(body.field_type || '').trim()
  if (!CHECKLIST_FIELD_TYPES.includes(fieldType)) {
    throw httpError('Invalid checklist field type.')
  }
  const options = OPTION_CHECKLIST_FIELD_TYPES.has(fieldType)
    ? normalizeOptions(body.options)
    : []
  if (OPTION_CHECKLIST_FIELD_TYPES.has(fieldType) && options.length < 2) {
    throw httpError('Dropdown and radio fields need at least two options.')
  }
  const sectionId = body.section_id === undefined
    ? undefined
    : (body.section_id || null)
  return {
    name,
    field_type: fieldType,
    options,
    is_required: Boolean(body.is_required),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    ...(sectionId !== undefined ? { section_id: sectionId } : {}),
  }
}

export async function createChecklistField(orgId, profileId, templateId, body = {}) {
  await getChecklistTemplate(orgId, templateId)
  const payload = normalizeFieldPayload(body)

  if (payload.section_id) {
    const { data: section, error: sectionError } = await supabaseAdmin
      .from('checklist_template_sections')
      .select('id')
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .eq('id', payload.section_id)
      .maybeSingle()
    if (sectionError) throw sectionError
    if (!section) throw httpError('Section not found for this checklist.', 404)
  }

  let query = supabaseAdmin
    .from('checklist_template_fields')
    .select('sort_order')
    .eq('template_id', templateId)
  if (payload.section_id) query = query.eq('section_id', payload.section_id)
  else query = query.is('section_id', null)

  const { data: last } = await query
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabaseAdmin
    .from('checklist_template_fields')
    .insert({
      org_id: orgId,
      template_id: templateId,
      ...payload,
      sort_order: body.sort_order != null ? payload.sort_order : (last?.sort_order || 0) + 10,
    })
    .select(FIELD_SELECT)
    .single()

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
  return data
}

export async function updateChecklistField(orgId, profileId, templateId, fieldId, body = {}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('checklist_template_fields')
    .select(FIELD_SELECT)
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .eq('id', fieldId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) throw httpError('Checklist field not found.', 404)

  const payload = normalizeFieldPayload({
    ...existing,
    ...body,
    options: body.options ?? existing.options,
    section_id: body.section_id !== undefined ? body.section_id : existing.section_id,
  })
  const { data, error } = await supabaseAdmin
    .from('checklist_template_fields')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fieldId)
    .eq('org_id', orgId)
    .select(FIELD_SELECT)
    .single()

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
  return data
}

export async function deleteChecklistField(orgId, profileId, templateId, fieldId) {
  const { error } = await supabaseAdmin
    .from('checklist_template_fields')
    .delete()
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .eq('id', fieldId)

  if (error) throw error
  await bumpChecklistVersion(orgId, templateId, profileId)
}

export async function reorderChecklistFields(orgId, profileId, templateId, fieldIds = []) {
  if (!Array.isArray(fieldIds) || !fieldIds.length) {
    throw httpError('Field order is required.')
  }

  const updates = fieldIds.map((id, index) => (
    supabaseAdmin
      .from('checklist_template_fields')
      .update({ sort_order: (index + 1) * 10, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('template_id', templateId)
      .eq('id', id)
  ))

  const results = await Promise.all(updates)
  const failed = results.find((row) => row.error)
  if (failed?.error) throw failed.error

  await bumpChecklistVersion(orgId, templateId, profileId)
  return getChecklistTemplate(orgId, templateId)
}

export async function snapshotChecklistTemplate(orgId, templateId) {
  if (!templateId) return null
  try {
    const template = await getChecklistTemplate(orgId, templateId)
    return {
      template_id: template.id,
      name: template.name,
      version: template.version,
      sections: (template.sections || []).map((section) => ({
        id: section.id,
        name: section.name,
        sort_order: section.sort_order,
      })),
      fields: (template.fields || []).map((field) => ({
        id: field.id,
        section_id: field.section_id || null,
        name: field.name,
        field_type: field.field_type,
        options: field.options || [],
        is_required: field.is_required,
        sort_order: field.sort_order,
      })),
    }
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}
