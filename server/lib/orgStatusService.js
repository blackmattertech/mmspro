import { supabaseAdmin } from '../services/supabase.js'
import {
  DEFAULT_ORG_STATUSES,
  ORG_STATUS_TABLE_TYPES,
  slugifyStatusKey,
} from './orgStatusDefaults.js'
import {
  createTaskStatus,
  deleteTaskStatus,
  ensureTaskMetaForOrg,
  listTaskStatuses,
  reorderTaskStatuses,
  resetTaskStatusesToDefault,
  updateTaskStatus,
} from './taskMetaService.js'

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function assertEntityType(entityType) {
  if (!ORG_STATUS_TABLE_TYPES.includes(entityType) && entityType !== 'task') {
    const err = new Error('Invalid status entity type.')
    err.status = 400
    throw err
  }
}

export async function ensureOrgStatusesForOrg(orgId, entityType = null) {
  const types = entityType ? [entityType] : ORG_STATUS_TABLE_TYPES
  for (const type of types) {
    if (!ORG_STATUS_TABLE_TYPES.includes(type)) continue
    const defaults = DEFAULT_ORG_STATUSES[type] || []
    if (!defaults.length) continue

    const { data: existing, error } = await supabaseAdmin
      .from('org_statuses')
      .select('key')
      .eq('org_id', orgId)
      .eq('entity_type', type)

    if (error) throw error
    const have = new Set((existing || []).map((row) => row.key))
    const missing = defaults.filter((row) => !have.has(row.key))
    if (!missing.length) continue

    const { error: insertError } = await supabaseAdmin.from('org_statuses').insert(
      missing.map((row) => ({
        org_id: orgId,
        entity_type: type,
        key: row.key,
        name: row.name,
        color: row.color || null,
        description: row.description || null,
        sort_order: row.sort_order ?? 0,
        is_active: true,
        is_system: true,
        is_terminal: Boolean(row.is_terminal),
      })),
    )
    if (insertError) throw insertError
  }
}

function mapTaskStatusRow(row) {
  return {
    id: row.id,
    entity_type: 'task',
    key: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    sort_order: row.sort_order,
    is_active: row.is_active !== false,
    is_system: false,
    is_terminal: Boolean(row.is_terminal),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listOrgStatuses(orgId, entityType, { includeInactive = false } = {}) {
  assertEntityType(entityType)

  if (entityType === 'task') {
    await ensureTaskMetaForOrg(orgId)
    const rows = await listTaskStatuses(orgId, { includeInactive })
    return rows.map(mapTaskStatusRow)
  }

  await ensureOrgStatusesForOrg(orgId, entityType)
  let query = supabaseAdmin
    .from('org_statuses')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getOrgStatusMap(orgId, entityType) {
  const rows = await listOrgStatuses(orgId, entityType, { includeInactive: true })
  const byKey = new Map()
  for (const row of rows) byKey.set(row.key, row)
  return byKey
}

export async function createOrgStatus(orgId, entityType, body) {
  assertEntityType(entityType)
  const name = trimOrNull(body.name)
  if (!name) {
    const err = new Error('Status name is required')
    err.status = 400
    throw err
  }

  if (entityType === 'task') {
    const row = await createTaskStatus(orgId, body)
    return mapTaskStatusRow(row)
  }

  await ensureOrgStatusesForOrg(orgId, entityType)
  let key = slugifyStatusKey(body.key || name)
  const { data: conflict } = await supabaseAdmin
    .from('org_statuses')
    .select('id')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('key', key)
    .maybeSingle()

  if (conflict) {
    key = `${key}_${Date.now().toString(36).slice(-4)}`
  }

  const { count } = await supabaseAdmin
    .from('org_statuses')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('entity_type', entityType)

  const { data, error } = await supabaseAdmin
    .from('org_statuses')
    .insert({
      org_id: orgId,
      entity_type: entityType,
      key,
      name,
      color: trimOrNull(body.color) || '#3B82F6',
      description: trimOrNull(body.description),
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : (count || 0),
      is_active: body.is_active !== false,
      is_system: false,
      is_terminal: Boolean(body.is_terminal),
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const err = new Error('A status with this name already exists for this type.')
      err.status = 400
      throw err
    }
    throw error
  }
  return data
}

export async function updateOrgStatus(orgId, entityType, id, body) {
  assertEntityType(entityType)

  if (entityType === 'task') {
    const row = await updateTaskStatus(orgId, id, body)
    return mapTaskStatusRow(row)
  }

  const { data: existing, error: findError } = await supabaseAdmin
    .from('org_statuses')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('id', id)
    .maybeSingle()

  if (findError) throw findError
  if (!existing) {
    const err = new Error('Status not found')
    err.status = 404
    throw err
  }

  const patch = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = trimOrNull(body.name)
    if (!name) {
      const err = new Error('Status name is required')
      err.status = 400
      throw err
    }
    patch.name = name
  }
  if (body.color !== undefined) patch.color = trimOrNull(body.color)
  if (body.description !== undefined) patch.description = trimOrNull(body.description)
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)
  if (body.is_terminal !== undefined) patch.is_terminal = Boolean(body.is_terminal)

  // System keys stay fixed so lifecycle code keeps working; name/label can change.
  if (!existing.is_system && body.key !== undefined) {
    const key = slugifyStatusKey(body.key)
    if (key) patch.key = key
  }

  const { data, error } = await supabaseAdmin
    .from('org_statuses')
    .update(patch)
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const err = new Error('A status with this name already exists for this type.')
      err.status = 400
      throw err
    }
    throw error
  }
  return data
}

export async function deleteOrgStatus(orgId, entityType, id) {
  assertEntityType(entityType)

  if (entityType === 'task') {
    await deleteTaskStatus(orgId, id)
    return { ok: true }
  }

  const { data: existing, error: findError } = await supabaseAdmin
    .from('org_statuses')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('id', id)
    .maybeSingle()

  if (findError) throw findError
  if (!existing) {
    const err = new Error('Status not found')
    err.status = 404
    throw err
  }
  if (existing.is_system) {
    const err = new Error('System statuses cannot be deleted. Deactivate them instead.')
    err.status = 400
    throw err
  }

  const tableByType = {
    work_request: 'work_requests',
    work_order: 'manual_work_orders',
    pm_plan: 'pm_plans',
  }
  const table = tableByType[entityType]
  if (table) {
    const { count, error: countError } = await supabaseAdmin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', existing.key)
    if (countError) throw countError
    if (count > 0) {
      const err = new Error('Cannot delete a status that is in use. Deactivate it instead.')
      err.status = 400
      throw err
    }
  }

  const { error } = await supabaseAdmin
    .from('org_statuses')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)

  if (error) throw error
  return { ok: true }
}

export async function reorderOrgStatuses(orgId, entityType, orderedIds) {
  assertEntityType(entityType)
  const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : []
  if (!ids.length) {
    const err = new Error('ordered_ids is required')
    err.status = 400
    throw err
  }

  if (entityType === 'task') {
    await reorderTaskStatuses(orgId, ids)
    return listOrgStatuses(orgId, entityType, { includeInactive: true })
  }

  const now = new Date().toISOString()
  for (let index = 0; index < ids.length; index += 1) {
    const { error } = await supabaseAdmin
      .from('org_statuses')
      .update({ sort_order: index, updated_at: now })
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('id', ids[index])
    if (error) throw error
  }
  return listOrgStatuses(orgId, entityType, { includeInactive: true })
}

export async function resetOrgStatuses(orgId, entityType) {
  assertEntityType(entityType)

  if (entityType === 'task') {
    await resetTaskStatusesToDefault(orgId)
    return listOrgStatuses(orgId, entityType, { includeInactive: true })
  }

  const defaults = DEFAULT_ORG_STATUSES[entityType] || []
  const { data: existing, error } = await supabaseAdmin
    .from('org_statuses')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)

  if (error) throw error

  const byKey = new Map((existing || []).map((row) => [row.key, row]))
  for (const def of defaults) {
    const row = byKey.get(def.key)
    if (row) {
      const { error: updateError } = await supabaseAdmin
        .from('org_statuses')
        .update({
          name: def.name,
          color: def.color,
          description: def.description || null,
          sort_order: def.sort_order,
          is_active: true,
          is_system: true,
          is_terminal: Boolean(def.is_terminal),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseAdmin.from('org_statuses').insert({
        org_id: orgId,
        entity_type: entityType,
        key: def.key,
        name: def.name,
        color: def.color,
        description: def.description || null,
        sort_order: def.sort_order,
        is_active: true,
        is_system: true,
        is_terminal: Boolean(def.is_terminal),
      })
      if (insertError) throw insertError
    }
  }

  return listOrgStatuses(orgId, entityType, { includeInactive: true })
}

/** Next statuses for WO lifecycle including active custom statuses. */
export async function getAllowedNextWorkOrderStatuses(orgId, fromStatus) {
  const { STATUS_TRANSITIONS } = await import('./workOrderService.js')
  const systemNext = [...(STATUS_TRANSITIONS[fromStatus] || [])]
  const rows = await listOrgStatuses(orgId, 'work_order', { includeInactive: false })
  const byKey = new Map(rows.map((row) => [row.key, row]))
  const fromRow = byKey.get(fromStatus)
  const customKeys = rows.filter((row) => !row.is_system).map((row) => row.key)

  let next = systemNext.filter((key) => {
    const row = byKey.get(key)
    return !row || row.is_active !== false
  })

  if (fromStatus !== 'draft' && fromStatus !== 'closed') {
    for (const key of customKeys) {
      if (!next.includes(key)) next.push(key)
    }
  }

  if (fromRow && !fromRow.is_system) {
    const recovery = ['in_progress', 'started', 'on_hold', 'waiting_material', 'waiting_shutdown', 'completed']
    for (const key of recovery) {
      const row = byKey.get(key)
      if ((!row || row.is_active !== false) && !next.includes(key)) next.push(key)
    }
  }

  return next
}

export async function assertWorkOrderStatusChange(orgId, fromStatus, toStatus) {
  if (fromStatus === toStatus) return
  const allowed = await getAllowedNextWorkOrderStatuses(orgId, fromStatus)
  if (!allowed.includes(toStatus)) {
    const err = new Error(
      `Cannot change status from ${String(fromStatus).replace(/_/g, ' ')} to ${String(toStatus).replace(/_/g, ' ')}.`,
    )
    err.status = 400
    throw err
  }
}
