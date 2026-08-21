import { supabaseAdmin } from '../services/supabase.js'
import {
  CHECKLIST_FIELD_TYPES,
  OPTION_CHECKLIST_FIELD_TYPES,
} from './pmConstants.js'

const TEMPLATE_SELECT = `
  id, org_id, name, description, version, is_active,
  created_by, updated_by, created_at, updated_at
`

const FIELD_SELECT = `
  id, org_id, template_id, name, field_type, options, is_required, sort_order,
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

async function loadFields(orgId, templateId) {
  const { data, error } = await supabaseAdmin
    .from('checklist_template_fields')
    .select(FIELD_SELECT)
    .eq('org_id', orgId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
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

  const counts = new Map()
  for (const field of fields || []) {
    counts.set(field.template_id, (counts.get(field.template_id) || 0) + 1)
  }

  return templates.map((row) => ({
    ...row,
    field_count: counts.get(row.id) || 0,
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

  const fields = await loadFields(orgId, templateId)
  return { ...data, fields }
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
  return { ...data, fields: [] }
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
  return { ...data, fields: existing.fields }
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
  return {
    name,
    field_type: fieldType,
    options,
    is_required: Boolean(body.is_required),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  }
}

export async function createChecklistField(orgId, profileId, templateId, body = {}) {
  await getChecklistTemplate(orgId, templateId)
  const payload = normalizeFieldPayload(body)

  const { data: last } = await supabaseAdmin
    .from('checklist_template_fields')
    .select('sort_order')
    .eq('template_id', templateId)
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

  const payload = normalizeFieldPayload({ ...existing, ...body, options: body.options ?? existing.options })
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
      fields: (template.fields || []).map((field) => ({
        id: field.id,
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
