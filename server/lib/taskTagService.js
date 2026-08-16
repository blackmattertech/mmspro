import { supabaseAdmin } from '../services/supabase.js'
import { DEFAULT_TAGS } from './taskDefaults.js'

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function ensureTaskTagsForOrg(orgId) {
  const { count, error: countError } = await supabaseAdmin
    .from('task_tags')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (countError) throw countError

  if (!count) {
    const { error } = await supabaseAdmin.from('task_tags').insert(
      DEFAULT_TAGS.map((name, index) => ({
        org_id: orgId,
        name,
        sort_order: index,
        is_active: true,
      })),
    )
    if (error) throw error
  }
}

export async function listTaskTags(orgId, { includeInactive = false } = {}) {
  await ensureTaskTagsForOrg(orgId)
  let query = supabaseAdmin
    .from('task_tags')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createTaskTag(orgId, body) {
  const name = trimOrNull(body.name)
  if (!name) throw Object.assign(new Error('Tag name is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_tags')
    .insert({
      org_id: orgId,
      name,
      color: trimOrNull(body.color),
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateTaskTag(orgId, id, body) {
  const patch = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) patch.name = trimOrNull(body.name)
  if (body.color !== undefined) patch.color = trimOrNull(body.color)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)

  const { data, error } = await supabaseAdmin
    .from('task_tags')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Tag not found'), { status: 404 })
  return data
}

export async function deleteTaskTag(orgId, id) {
  await supabaseAdmin.from('task_tag_assignments').delete().eq('tag_id', id)

  const { error } = await supabaseAdmin
    .from('task_tags')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function reorderTaskTags(orgId, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw Object.assign(new Error('orderedIds must be an array'), { status: 400 })
  }

  await Promise.all(orderedIds.map((id, index) => supabaseAdmin
    .from('task_tags')
    .update({ sort_order: index, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)))

  return listTaskTags(orgId, { includeInactive: true })
}

export async function resetTaskTagsToDefault(orgId) {
  await ensureTaskTagsForOrg(orgId)

  const { data: existing, error } = await supabaseAdmin
    .from('task_tags')
    .select('*')
    .eq('org_id', orgId)

  if (error) throw error

  const byName = new Map((existing || []).map((row) => [row.name, row]))

  for (let i = 0; i < DEFAULT_TAGS.length; i++) {
    const name = DEFAULT_TAGS[i]
    const match = byName.get(name)
    const payload = { name, sort_order: i, is_active: true, updated_at: new Date().toISOString() }

    if (match) {
      const { error: updateError } = await supabaseAdmin
        .from('task_tags')
        .update(payload)
        .eq('org_id', orgId)
        .eq('id', match.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('task_tags')
        .insert({ ...payload, org_id: orgId })
      if (insertError) throw insertError
    }
  }

  return listTaskTags(orgId, { includeInactive: true })
}

export async function syncTaskTagAssignments(orgId, taskId, tagIds) {
  await supabaseAdmin.from('task_tag_assignments').delete().eq('task_id', taskId)
  const uniqueIds = [...new Set((tagIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  const { error } = await supabaseAdmin.from('task_tag_assignments').insert(
    uniqueIds.map((tagId) => ({
      org_id: orgId,
      task_id: taskId,
      tag_id: tagId,
    })),
  )
  if (error) throw error
}

export async function loadTagsForTasks(taskIds) {
  const map = new Map()
  if (!taskIds.length) return map

  const { data, error } = await supabaseAdmin
    .from('task_tag_assignments')
    .select('task_id, tag:tag_id (id, name, color)')
    .in('task_id', taskIds)

  if (error) throw error

  for (const row of data || []) {
    if (!row.tag) continue
    const list = map.get(row.task_id) || []
    list.push(row.tag)
    map.set(row.task_id, list)
  }

  return map
}
