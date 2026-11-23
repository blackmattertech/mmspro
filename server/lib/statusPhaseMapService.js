import { supabaseAdmin } from '../services/supabase.js'
import {
  STATUS_FILTER_ENTITY_TYPES,
  MODULE_PHASE_CATALOGS,
  DEFAULT_STATUS_PHASE_MAPS,
  WR_DISPLAY_STATUS_KEYS,
  WARRANTY_STATUS_KEYS,
  assertStatusFilterEntityType,
  phaseIdsForEntity,
  buildPhasesFromMaps,
  defaultMapRowsForEntity,
  defaultTaskMapsFromStatuses,
  mappingsToObject,
} from '../shared/statusPhaseMaps.js'
import { listOrgStatuses } from './orgStatusService.js'
import { ensureTaskMetaForOrg, listTaskStatuses } from './taskMetaService.js'

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

async function listMaps(orgId, entityType = null) {
  let query = supabaseAdmin
    .from('org_status_phase_maps')
    .select('id, org_id, entity_type, status_key, phase_id, updated_at')
    .eq('org_id', orgId)
    .order('status_key')
  if (entityType) query = query.eq('entity_type', entityType)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function insertDefaultRows(orgId, entityType, rows) {
  if (!rows.length) return
  const { error } = await supabaseAdmin.from('org_status_phase_maps').insert(
    rows.map((row) => ({
      org_id: orgId,
      entity_type: entityType,
      status_key: row.status_key,
      phase_id: row.phase_id,
    })),
  )
  if (error) throw error
}

/**
 * Ensure default maps exist for an org/module. Task maps use current task_statuses.
 */
export async function ensureStatusPhaseMapsForOrg(orgId, entityType = null) {
  const types = entityType
    ? [assertStatusFilterEntityType(entityType)]
    : STATUS_FILTER_ENTITY_TYPES.map((row) => row.key)

  for (const type of types) {
    const existing = await listMaps(orgId, type)
    if (existing.length) continue

    if (type === 'task') {
      await ensureTaskMetaForOrg(orgId)
      const statuses = await listTaskStatuses(orgId, { includeInactive: true })
      const maps = defaultTaskMapsFromStatuses(statuses)
      await insertDefaultRows(
        orgId,
        type,
        Object.entries(maps).map(([status_key, phase_id]) => ({ status_key, phase_id })),
      )
      continue
    }

    await insertDefaultRows(orgId, type, defaultMapRowsForEntity(type))
  }
}

async function mappableStatusesForEntity(orgId, entityType) {
  if (entityType === 'warranty') {
    return WARRANTY_STATUS_KEYS.map((row) => ({
      key: row.key,
      name: row.name,
      color: row.color,
      is_active: true,
      is_system: true,
    }))
  }

  if (entityType === 'work_request') {
    const orgRows = await listOrgStatuses(orgId, 'work_request', { includeInactive: true })
    const woRows = await listOrgStatuses(orgId, 'work_order', { includeInactive: true })
    const byKey = new Map()
    for (const row of WR_DISPLAY_STATUS_KEYS) {
      byKey.set(row.key, {
        key: row.key,
        name: row.name,
        color: row.color,
        is_active: true,
        is_system: true,
      })
    }
    for (const row of [...orgRows, ...woRows]) {
      const key = String(row.key || '')
      if (!key) continue
      byKey.set(key, {
        key,
        name: row.name || key,
        color: row.color || null,
        is_active: row.is_active !== false,
        is_system: Boolean(row.is_system),
      })
    }
    return [...byKey.values()]
  }

  if (entityType === 'task') {
    await ensureTaskMetaForOrg(orgId)
    const rows = await listTaskStatuses(orgId, { includeInactive: true })
    return rows.map((row) => ({
      key: String(row.id),
      name: row.name,
      color: row.color || null,
      is_active: row.is_active !== false,
      is_system: false,
      is_terminal: Boolean(row.is_terminal),
    }))
  }

  const rows = await listOrgStatuses(orgId, entityType, { includeInactive: true })
  return rows.map((row) => ({
    key: String(row.key),
    name: row.name,
    color: row.color || null,
    is_active: row.is_active !== false,
    is_system: Boolean(row.is_system),
  }))
}

export async function getStatusFilterModule(orgId, entityType) {
  const type = assertStatusFilterEntityType(entityType)
  await ensureStatusPhaseMapsForOrg(orgId, type)

  const meta = STATUS_FILTER_ENTITY_TYPES.find((row) => row.key === type)
  const [maps, statuses] = await Promise.all([
    listMaps(orgId, type),
    mappableStatusesForEntity(orgId, type),
  ])
  const mappingObject = mappingsToObject(maps)
  const phases = buildPhasesFromMaps(type, maps)

  return {
    entity_type: type,
    label: meta?.label || type,
    description: meta?.description || '',
    phases: MODULE_PHASE_CATALOGS[type],
    phase_bar: phases,
    mappings: maps.map((row) => ({
      status_key: row.status_key,
      phase_id: row.phase_id,
    })),
    mapping_by_status: mappingObject,
    statuses,
    unmapped_count: statuses.filter((row) => !mappingObject[row.key]).length,
  }
}

export async function listStatusFilterModules(orgId) {
  await ensureStatusPhaseMapsForOrg(orgId)
  const modules = await Promise.all(
    STATUS_FILTER_ENTITY_TYPES.map((row) => getStatusFilterModule(orgId, row.key)),
  )
  return modules
}

export async function listStatusPhaseMapsByEntity(orgId) {
  await ensureStatusPhaseMapsForOrg(orgId)
  const rows = await listMaps(orgId)
  const byType = {}
  for (const type of Object.keys(MODULE_PHASE_CATALOGS)) {
    byType[type] = []
  }
  for (const row of rows) {
    if (!byType[row.entity_type]) byType[row.entity_type] = []
    byType[row.entity_type].push({
      status_key: row.status_key,
      phase_id: row.phase_id,
    })
  }
  return byType
}

export async function replaceStatusPhaseMaps(orgId, entityType, mappingsInput) {
  const type = assertStatusFilterEntityType(entityType)
  const allowedPhases = phaseIdsForEntity(type)
  const statuses = await mappableStatusesForEntity(orgId, type)
  const allowedKeys = new Set(statuses.map((row) => row.key))

  const next = []
  const seen = new Set()
  for (const raw of mappingsInput || []) {
    const statusKey = String(raw?.status_key || '').trim()
    const phaseId = raw?.phase_id == null || raw?.phase_id === ''
      ? null
      : String(raw.phase_id).trim()
    if (!statusKey) continue
    if (!allowedKeys.has(statusKey)) {
      throw httpError(`Unknown status "${statusKey}" for ${type}.`)
    }
    if (seen.has(statusKey)) {
      throw httpError(`Duplicate mapping for status "${statusKey}".`)
    }
    seen.add(statusKey)
    if (!phaseId) continue
    if (!allowedPhases.has(phaseId)) {
      throw httpError(`Invalid pill "${phaseId}" for ${type}.`)
    }
    next.push({ status_key: statusKey, phase_id: phaseId })
  }

  const { error: deleteError } = await supabaseAdmin
    .from('org_status_phase_maps')
    .delete()
    .eq('org_id', orgId)
    .eq('entity_type', type)
  if (deleteError) throw deleteError

  if (next.length) {
    await insertDefaultRows(orgId, type, next)
  }

  return getStatusFilterModule(orgId, type)
}

export async function resetStatusPhaseMaps(orgId, entityType) {
  const type = assertStatusFilterEntityType(entityType)

  const { error: deleteError } = await supabaseAdmin
    .from('org_status_phase_maps')
    .delete()
    .eq('org_id', orgId)
    .eq('entity_type', type)
  if (deleteError) throw deleteError

  if (type === 'task') {
    await ensureTaskMetaForOrg(orgId)
    const statuses = await listTaskStatuses(orgId, { includeInactive: true })
    const maps = defaultTaskMapsFromStatuses(statuses)
    await insertDefaultRows(
      orgId,
      type,
      Object.entries(maps).map(([status_key, phase_id]) => ({ status_key, phase_id })),
    )
  } else {
    await insertDefaultRows(orgId, type, defaultMapRowsForEntity(type))
  }

  return getStatusFilterModule(orgId, type)
}

export {
  STATUS_FILTER_ENTITY_TYPES,
  MODULE_PHASE_CATALOGS,
  DEFAULT_STATUS_PHASE_MAPS,
  buildPhasesFromMaps,
}
