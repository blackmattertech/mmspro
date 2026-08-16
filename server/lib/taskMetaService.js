import { supabaseAdmin } from '../services/supabase.js'
import { DEFAULT_STATUSES, DEFAULT_PRIORITIES } from './taskDefaults.js'

export async function ensureTaskMetaForOrg(orgId) {
  const { count: statusCount, error: statusCountError } = await supabaseAdmin
    .from('task_statuses')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (statusCountError) throw statusCountError

  if (!statusCount) {
    const { error } = await supabaseAdmin.from('task_statuses').insert(
      DEFAULT_STATUSES.map((row) => ({ ...row, org_id: orgId })),
    )
    if (error) throw error
  }

  const { count: priorityCount, error: priorityCountError } = await supabaseAdmin
    .from('task_priorities')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (priorityCountError) throw priorityCountError

  if (!priorityCount) {
    const { error } = await supabaseAdmin.from('task_priorities').insert(
      DEFAULT_PRIORITIES.map((row) => ({ ...row, org_id: orgId })),
    )
    if (error) throw error
  }
}

export async function listTaskStatuses(orgId, { includeInactive = false } = {}) {
  await ensureTaskMetaForOrg(orgId)
  let query = supabaseAdmin
    .from('task_statuses')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function listTaskPriorities(orgId, { includeInactive = false } = {}) {
  await ensureTaskMetaForOrg(orgId)
  let query = supabaseAdmin
    .from('task_priorities')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function createTaskStatus(orgId, body) {
  const name = trimOrNull(body.name)
  if (!name) throw Object.assign(new Error('Status name is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_statuses')
    .insert({
      org_id: orgId,
      name,
      color: trimOrNull(body.color),
      description: trimOrNull(body.description),
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
      is_terminal: Boolean(body.is_terminal),
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateTaskStatus(orgId, id, body) {
  const patch = {}
  if (body.name !== undefined) patch.name = trimOrNull(body.name)
  if (body.color !== undefined) patch.color = trimOrNull(body.color)
  if (body.description !== undefined) patch.description = trimOrNull(body.description)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)
  if (body.is_terminal !== undefined) patch.is_terminal = Boolean(body.is_terminal)
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('task_statuses')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Status not found'), { status: 404 })
  return data
}

export async function deleteTaskStatus(orgId, id) {
  const { count, error: countError } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status_id', id)

  if (countError) throw countError
  if (count > 0) {
    throw Object.assign(new Error('Cannot delete a status that is in use'), { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('task_statuses')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function reorderTaskStatuses(orgId, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw Object.assign(new Error('orderedIds must be an array'), { status: 400 })
  }

  await Promise.all(orderedIds.map((id, index) => supabaseAdmin
    .from('task_statuses')
    .update({ sort_order: index, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)))

  return listTaskStatuses(orgId, { includeInactive: true })
}

export async function createTaskPriority(orgId, body) {
  const name = trimOrNull(body.name)
  if (!name) throw Object.assign(new Error('Priority name is required'), { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_priorities')
    .insert({
      org_id: orgId,
      name,
      icon: trimOrNull(body.icon),
      color: trimOrNull(body.color),
      description: trimOrNull(body.description),
      sort_order: Number(body.sort_order) || 0,
      is_active: body.is_active !== false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateTaskPriority(orgId, id, body) {
  const patch = {}
  if (body.name !== undefined) patch.name = trimOrNull(body.name)
  if (body.icon !== undefined) patch.icon = trimOrNull(body.icon)
  if (body.color !== undefined) patch.color = trimOrNull(body.color)
  if (body.description !== undefined) patch.description = trimOrNull(body.description)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('task_priorities')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Priority not found'), { status: 404 })
  return data
}

export async function deleteTaskPriority(orgId, id) {
  const { count, error: countError } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('priority_id', id)

  if (countError) throw countError
  if (count > 0) {
    throw Object.assign(new Error('Cannot delete a priority that is in use'), { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('task_priorities')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function reorderTaskPriorities(orgId, orderedIds) {
  if (!Array.isArray(orderedIds)) {
    throw Object.assign(new Error('orderedIds must be an array'), { status: 400 })
  }

  await Promise.all(orderedIds.map((id, index) => supabaseAdmin
    .from('task_priorities')
    .update({ sort_order: index, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('id', id)))

  return listTaskPriorities(orgId, { includeInactive: true })
}

async function upsertDefaults(orgId, table, defaults, mapRow) {
  await ensureTaskMetaForOrg(orgId)

  const { data: existing, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('org_id', orgId)

  if (error) throw error

  const byName = new Map((existing || []).map((row) => [row.name, row]))

  for (let i = 0; i < defaults.length; i++) {
    const def = defaults[i]
    const match = byName.get(def.name)
    const payload = mapRow(def, i)

    if (match) {
      const { error: updateError } = await supabaseAdmin
        .from(table)
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('id', match.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin
        .from(table)
        .insert({ ...payload, org_id: orgId })
      if (insertError) throw insertError
    }
  }
}

export async function resetTaskStatusesToDefault(orgId) {
  await upsertDefaults(orgId, 'task_statuses', DEFAULT_STATUSES, (def, index) => ({
    name: def.name,
    color: def.color,
    description: def.description,
    sort_order: index,
    is_active: true,
    is_terminal: def.is_terminal,
  }))

  return listTaskStatuses(orgId, { includeInactive: true })
}

export async function resetTaskPrioritiesToDefault(orgId) {
  await upsertDefaults(orgId, 'task_priorities', DEFAULT_PRIORITIES, (def, index) => ({
    name: def.name,
    icon: def.icon,
    color: def.color,
    description: def.description,
    sort_order: index,
    is_active: true,
  }))

  return listTaskPriorities(orgId, { includeInactive: true })
}
