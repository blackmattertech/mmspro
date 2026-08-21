import { supabaseAdmin } from '../services/supabase.js'
import { addWorkOrderTimelineEvent } from './workOrderService.js'

export const DAILY_LOG_ACTIVE_STATUSES = new Set([
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
])

export const DAILY_LOG_READONLY_STATUSES = new Set([
  'completed',
  'verified',
  'closed',
])

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export function sanitizeDailyLogMaterials(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((row) => ({
      code: String(row?.code || '').trim(),
      description: String(row?.description || '').trim(),
      uom: String(row?.uom || '').trim(),
      qty: String(row?.qty ?? '').trim(),
    }))
    .filter((row) => row.code || row.description || row.uom || row.qty)
}

export function rollupMaterialsFromLogs(logs) {
  const merged = new Map()
  for (const log of logs || []) {
    for (const row of sanitizeDailyLogMaterials(log.materials)) {
      const key = `${row.code.toLowerCase()}|${row.description.toLowerCase()}|${row.uom.toLowerCase()}`
      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, { ...row })
        continue
      }
      const a = Number(existing.qty)
      const b = Number(row.qty)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        existing.qty = String(a + b)
      } else if (!existing.qty && row.qty) {
        existing.qty = row.qty
      }
    }
  }
  return [...merged.values()]
}

export function serializeMaterialConsumed(rows) {
  const filled = sanitizeDailyLogMaterials(rows)
  return filled.length ? JSON.stringify(filled) : null
}

function todayDateString(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

async function loadWorkOrder(orgId, workOrderId) {
  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('id, status, work_start_at, work_end_at, material_consumed')
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw httpError('Work order not found.', 404)
  return data
}

function assertCanEditLogs(workOrder) {
  if (DAILY_LOG_READONLY_STATUSES.has(workOrder.status)) {
    throw httpError('Daily logs cannot be edited after the work order is completed.')
  }
  if (!DAILY_LOG_ACTIVE_STATUSES.has(workOrder.status)) {
    throw httpError('Start the work order before recording daily logs.')
  }
}

export async function listWorkOrderDailyLogs(orgId, workOrderId) {
  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
    .order('log_date', { ascending: false })
    .order('started_at', { ascending: false })

  if (error) throw error
  const logs = data || []
  return {
    logs,
    open_log: logs.find((row) => row.day_status === 'open') || null,
    material_summary: rollupMaterialsFromLogs(logs),
  }
}

async function syncWorkOrderFromLogs(orgId, workOrderId, logs) {
  const materialRows = rollupMaterialsFromLogs(logs)
  const patch = {
    updated_at: new Date().toISOString(),
  }

  if (materialRows.length) {
    patch.material_consumed = serializeMaterialConsumed(materialRows)
  }

  const withStart = logs
    .map((row) => row.started_at)
    .filter(Boolean)
    .sort()
  const withEnd = logs
    .map((row) => row.ended_at)
    .filter(Boolean)
    .sort()

  if (withStart.length) patch.work_start_at = withStart[0]
  if (withEnd.length) patch.work_end_at = withEnd[withEnd.length - 1]

  const { error } = await supabaseAdmin
    .from('manual_work_orders')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', workOrderId)

  if (error) throw error
  return patch
}

export async function startWorkOrderDay(orgId, profileId, workOrderId, { timeZone } = {}) {
  const workOrder = await loadWorkOrder(orgId, workOrderId)
  assertCanEditLogs(workOrder)

  const { logs, open_log } = await listWorkOrderDailyLogs(orgId, workOrderId)
  if (open_log) {
    throw httpError(
      `End the open day (${open_log.log_date}) before starting a new day.`,
    )
  }

  const logDate = todayDateString(timeZone)
  const existingToday = logs.find((row) => row.log_date === logDate)
  if (existingToday) {
    if (existingToday.day_status === 'closed') {
      throw httpError('A log for today already exists and is closed. Edit that day instead.')
    }
    return existingToday
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .insert({
      org_id: orgId,
      work_order_id: workOrderId,
      log_date: logDate,
      started_at: now,
      day_status: 'open',
      materials: [],
      created_by: profileId,
      updated_by: profileId,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw httpError('A daily log for this date already exists.')
    }
    throw error
  }

  const refreshed = await listWorkOrderDailyLogs(orgId, workOrderId)
  await syncWorkOrderFromLogs(orgId, workOrderId, refreshed.logs)

  await addWorkOrderTimelineEvent(
    orgId,
    workOrderId,
    'daily_log_started',
    `Daily work log started for ${logDate}.`,
    profileId,
    { metadata: { daily_log_id: data.id, log_date: logDate } },
  )

  return data
}

export async function updateWorkOrderDailyLog(orgId, profileId, workOrderId, logId, body = {}) {
  const workOrder = await loadWorkOrder(orgId, workOrderId)
  assertCanEditLogs(workOrder)

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('work_order_daily_logs')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
    .eq('id', logId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!existing) throw httpError('Daily log not found.', 404)

  const patch = {
    updated_by: profileId,
    updated_at: new Date().toISOString(),
  }

  if (body.work_done !== undefined) patch.work_done = String(body.work_done || '').trim() || null
  if (body.remarks !== undefined) patch.remarks = String(body.remarks || '').trim() || null
  if (body.labour_count !== undefined) {
    patch.labour_count = body.labour_count === '' || body.labour_count == null
      ? null
      : Number(body.labour_count)
    if (patch.labour_count != null && !Number.isFinite(patch.labour_count)) {
      throw httpError('Labour count must be a number.')
    }
  }
  if (body.materials !== undefined) {
    patch.materials = sanitizeDailyLogMaterials(body.materials)
  }

  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .update(patch)
    .eq('id', logId)
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
    .select('*')
    .single()

  if (error) throw error

  const refreshed = await listWorkOrderDailyLogs(orgId, workOrderId)
  await syncWorkOrderFromLogs(orgId, workOrderId, refreshed.logs)

  await addWorkOrderTimelineEvent(
    orgId,
    workOrderId,
    'daily_log_updated',
    `Daily work log updated for ${existing.log_date}.`,
    profileId,
    { metadata: { daily_log_id: logId, log_date: existing.log_date } },
  )

  return data
}

export async function endWorkOrderDay(orgId, profileId, workOrderId, logId, body = {}) {
  const workOrder = await loadWorkOrder(orgId, workOrderId)
  assertCanEditLogs(workOrder)

  const { data: existing, error: loadError } = await supabaseAdmin
    .from('work_order_daily_logs')
    .select('*')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
    .eq('id', logId)
    .maybeSingle()

  if (loadError) throw loadError
  if (!existing) throw httpError('Daily log not found.', 404)
  if (existing.day_status === 'closed') {
    throw httpError('This day is already closed.')
  }

  const workDone = body.work_done !== undefined
    ? String(body.work_done || '').trim()
    : String(existing.work_done || '').trim()
  if (!workDone) {
    throw httpError('Describe the work done today before ending the day.')
  }

  const materials = body.materials !== undefined
    ? sanitizeDailyLogMaterials(body.materials)
    : sanitizeDailyLogMaterials(existing.materials)

  const now = new Date().toISOString()
  const patch = {
    work_done: workDone,
    materials,
    day_status: 'closed',
    ended_at: body.ended_at || now,
    updated_by: profileId,
    updated_at: now,
  }
  if (body.remarks !== undefined) patch.remarks = String(body.remarks || '').trim() || null
  if (body.labour_count !== undefined) {
    patch.labour_count = body.labour_count === '' || body.labour_count == null
      ? null
      : Number(body.labour_count)
  }

  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .update(patch)
    .eq('id', logId)
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
    .select('*')
    .single()

  if (error) throw error

  const refreshed = await listWorkOrderDailyLogs(orgId, workOrderId)
  await syncWorkOrderFromLogs(orgId, workOrderId, refreshed.logs)

  await addWorkOrderTimelineEvent(
    orgId,
    workOrderId,
    'daily_log_ended',
    `Daily work log ended for ${existing.log_date}.`,
    profileId,
    { metadata: { daily_log_id: logId, log_date: existing.log_date } },
  )

  return data
}
