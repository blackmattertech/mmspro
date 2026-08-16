import { supabaseAdmin } from '../services/supabase.js'
import { DEFAULT_CATEGORIES } from './taskDefaults.js'

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function ensureTaskCategoriesForOrg(orgId) {
  const { count, error: countError } = await supabaseAdmin
    .from('task_categories')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (countError) throw countError

  if (!count) {
    const { error } = await supabaseAdmin.from('task_categories').insert(
      DEFAULT_CATEGORIES.map((name, index) => ({
        org_id: orgId,
        name,
        sort_order: index,
        is_active: true,
      })),
    )
    if (error) throw error
  }
}

export async function listTaskCategories(orgId, { includeInactive = false } = {}) {
  await ensureTaskCategoriesForOrg(orgId)
  let query = supabaseAdmin
    .from('task_categories')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createTaskCategory(orgId, body) {
  const name = trimOrNull(body.name)
  if (!name) throw Object.assign(new Error('Category name is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_categories')
    .insert({
      org_id: orgId,
      name,
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateTaskCategory(orgId, id, body) {
  const patch = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = trimOrNull(body.name)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)

  const { data, error } = await supabaseAdmin
    .from('task_categories')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Category not found'), { status: 404 })
  return data
}

export async function deleteTaskCategory(orgId, id) {
  const { count, error: countError } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('category_id', id)

  if (countError) throw countError
  if (count > 0) {
    throw Object.assign(new Error('Cannot delete a category that is in use'), { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('task_categories')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function reorderTaskCategories(orgId, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw Object.assign(new Error('orderedIds must be an array'), { status: 400 })
  }

  await Promise.all(orderedIds.map((id, index) => supabaseAdmin
    .from('task_categories')
    .update({ sort_order: index, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)))

  return listTaskCategories(orgId, { includeInactive: true })
}

export async function resetTaskCategoriesToDefault(orgId) {
  await ensureTaskCategoriesForOrg(orgId)

  const { data: existing, error } = await supabaseAdmin
    .from('task_categories')
    .select('*')
    .eq('org_id', orgId)

  if (error) throw error

  const byName = new Map((existing || []).map((row) => [row.name, row]))

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const name = DEFAULT_CATEGORIES[i]
    const match = byName.get(name)
    const payload = { name, sort_order: i, is_active: true, updated_at: new Date().toISOString() }

    if (match) {
      const { error: updateError } = await supabaseAdmin
        .from('task_categories')
        .update(payload)
        .eq('org_id', orgId)
        .eq('id', match.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('task_categories')
        .insert({ ...payload, org_id: orgId })
      if (insertError) throw insertError
    }
  }

  return listTaskCategories(orgId, { includeInactive: true })
}
