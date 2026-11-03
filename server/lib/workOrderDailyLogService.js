import { supabaseAdmin } from '../services/supabase.js'
import { addWorkOrderTimelineEvent } from './workOrderService.js'
import { clipMaterialDescriptions, clipTrimmedToLimit, getTextFieldLimitsMap } from './textFieldLimits.js'

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

const SNAPSHOT_NATIVE_KEYS = [
  'job_description',
  'root_cause',
  'action_taken',
  'special_tools_used',
  'safety_precautions',
  'dos_and_donts',
  'lessons_learned',
  'execution_remarks',
  'remarks',
  'labour_count',
  'work_done',
  'work_start_at',
  'work_end_at',
]

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

function parseMaterialRows(value) {
  if (Array.isArray(value)) return sanitizeDailyLogMaterials(value)
  if (value && typeof value === 'object' && Array.isArray(value.rows)) {
    return sanitizeDailyLogMaterials(value.rows)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return sanitizeDailyLogMaterials(parsed)
    } catch {
      return []
    }
  }
  return []
}

export function rollupMaterialsFromLogs(logs) {
  const merged = new Map()
  for (const log of logs || []) {
    const rows = sanitizeDailyLogMaterials(
      log.field_snapshot?.material_rows ?? log.materials,
    )
    for (const row of rows) {
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

export function todayDateString(timeZone) {
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

export function normalizeFieldSnapshot(raw = {}, { fieldLimits = null } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const materialRows = clipMaterialDescriptions(
    fieldLimits || {},
    parseMaterialRows(source.material_rows ?? source.materials),
  )
  const checklistValues = source.checklist_values && typeof source.checklist_values === 'object'
    ? source.checklist_values
    : {}
  const processExtras = source.process_extras && typeof source.process_extras === 'object'
    ? source.process_extras
    : {}
  const attachmentPaths = Array.isArray(source.execution_attachment_paths)
    ? source.execution_attachment_paths.map((path) => String(path || '').trim()).filter(Boolean)
    : []

  const snapshot = {
    checklist_values: checklistValues,
    process_extras: processExtras,
    material_rows: materialRows,
    execution_attachment_paths: attachmentPaths,
  }

  for (const key of SNAPSHOT_NATIVE_KEYS) {
    if (source[key] === undefined) continue
    if (key === 'labour_count') {
      if (source[key] === '' || source[key] == null) {
        snapshot[key] = null
      } else {
        const n = Number(source[key])
        snapshot[key] = Number.isFinite(n) ? n : null
      }
      continue
    }
    if (key === 'remarks' || key === 'execution_remarks' || key === 'job_description'
      || key === 'root_cause' || key === 'action_taken' || key === 'lessons_learned'
      || key === 'work_done') {
      snapshot[key] = fieldLimits
        ? clipTrimmedToLimit(fieldLimits, key === 'work_done' ? 'remarks' : key, source[key])
        : (String(source[key] || '').trim() || null)
      continue
    }
    snapshot[key] = source[key] == null || source[key] === '' ? null : source[key]
  }

  return snapshot
}

/** Build a day snapshot from a lifecycle patch body + current WO row. */
export function buildFieldSnapshotFromLifecycle(body = {}, existing = {}, processExtras = {}) {
  const materialRows = body.material_consumed !== undefined
    ? parseMaterialRows(body.material_consumed)
    : parseMaterialRows(existing.material_consumed)

  const attachmentPaths = Array.isArray(body.execution_attachments)
    ? body.execution_attachments.map((file) => file?.path).filter(Boolean)
    : Array.isArray(existing.attachments)
      ? existing.attachments.filter((file) => file?.source === 'execution').map((file) => file.path).filter(Boolean)
      : []

  return normalizeFieldSnapshot({
    job_description: body.job_description !== undefined ? body.job_description : existing.job_description,
    root_cause: body.root_cause !== undefined ? body.root_cause : existing.root_cause,
    action_taken: body.action_taken !== undefined ? body.action_taken : existing.action_taken,
    special_tools_used: body.special_tools_used !== undefined ? body.special_tools_used : existing.special_tools_used,
    safety_precautions: body.safety_precautions !== undefined ? body.safety_precautions : existing.safety_precautions,
    dos_and_donts: body.dos_and_donts !== undefined ? body.dos_and_donts : existing.dos_and_donts,
    lessons_learned: body.lessons_learned !== undefined ? body.lessons_learned : existing.lessons_learned,
    execution_remarks: body.execution_remarks !== undefined ? body.execution_remarks : existing.execution_remarks,
    remarks: body.remarks !== undefined ? body.remarks : null,
    labour_count: body.labour_count !== undefined ? body.labour_count : existing.labour_count,
    work_done: body.work_done !== undefined ? body.work_done : null,
    work_start_at: (() => {
      if (body.work_start_at !== undefined && body.work_start_at) return body.work_start_at
      return existing.work_start_at || body.work_start_at || null
    })(),
    work_end_at: (() => {
      if (body.work_end_at !== undefined && body.work_end_at) return body.work_end_at
      return existing.work_end_at || body.work_end_at || null
    })(),
    checklist_values: (() => {
      const incoming = body.checklist_values !== undefined
        ? body.checklist_values
        : null
      const existingValues = existing.checklist_values || {}
      if (incoming && typeof incoming === 'object') {
        const hasAnswers = Object.values(incoming).some((value) => {
          if (value === true) return true
          if (value == null) return false
          return String(value).trim() !== ''
        })
        if (hasAnswers) return incoming
      }
      return existingValues
    })(),
    process_extras: body.process_extras !== undefined
      ? body.process_extras
      : (processExtras || {}),
    material_rows: materialRows,
    execution_attachment_paths: attachmentPaths,
  })
}

function legacyColumnsFromSnapshot(snapshot) {
  return {
    work_done: snapshot.work_done || snapshot.execution_remarks || snapshot.job_description || null,
    remarks: snapshot.remarks || snapshot.execution_remarks || null,
    labour_count: snapshot.labour_count ?? null,
    materials: sanitizeDailyLogMaterials(snapshot.material_rows),
  }
}

async function loadWorkOrder(orgId, workOrderId) {
  const { data, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
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
    throw httpError('Start the work order before recording daily field snapshots.')
  }
}

export function shouldSnapshotLifecycleDay(status) {
  return DAILY_LOG_ACTIVE_STATUSES.has(status)
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
  const logs = (data || []).map((row) => ({
    ...row,
    field_snapshot: normalizeFieldSnapshot(
      row.field_snapshot && Object.keys(row.field_snapshot || {}).length
        ? row.field_snapshot
        : {
          work_done: row.work_done,
          remarks: row.remarks,
          labour_count: row.labour_count,
          material_rows: row.materials,
        },
    ),
  }))
  const today = todayDateString()
  return {
    logs,
    open_log: logs.find((row) => row.log_date === today) || logs.find((row) => row.day_status === 'open') || null,
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
    .map((row) => row.started_at || row.field_snapshot?.work_start_at)
    .filter(Boolean)
    .sort()
  const withEnd = logs
    .map((row) => row.ended_at || row.field_snapshot?.work_end_at)
    .filter(Boolean)
    .sort()

  if (withStart.length) patch.work_start_at = withStart[0]
  if (withEnd.length) patch.work_end_at = withEnd[withEnd.length - 1]

  // Latest day by log_date wins for native execution columns on the WO row.
  const latest = [...logs].sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)))[0]
  const snap = latest?.field_snapshot || {}
  for (const key of [
    'job_description',
    'root_cause',
    'action_taken',
    'special_tools_used',
    'safety_precautions',
    'dos_and_donts',
    'lessons_learned',
    'execution_remarks',
    'labour_count',
    'checklist_values',
  ]) {
    if (snap[key] === undefined) continue
    if (key === 'checklist_values') {
      const values = snap.checklist_values && typeof snap.checklist_values === 'object'
        ? snap.checklist_values
        : {}
      const hasAnswers = Object.values(values).some((value) => {
        if (value === true) return true
        if (value == null) return false
        return String(value).trim() !== ''
      })
      if (!hasAnswers) continue
    }
    patch[key] = snap[key]
  }

  const { error } = await supabaseAdmin
    .from('manual_work_orders')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', workOrderId)

  if (error) throw error
  return patch
}

export async function upsertWorkOrderDaySnapshot(
  orgId,
  profileId,
  workOrderId,
  {
    timeZone,
    snapshot: rawSnapshot,
    body = null,
    existing = null,
  } = {},
) {
  const workOrder = existing || await loadWorkOrder(orgId, workOrderId)
  const statusForGate = body?.status && DAILY_LOG_ACTIVE_STATUSES.has(body.status)
    ? body.status
    : workOrder.status
  if (!shouldSnapshotLifecycleDay(statusForGate) && !shouldSnapshotLifecycleDay(workOrder.status)) {
    return null
  }
  // Allow first save that transitions into an active status.
  if (!shouldSnapshotLifecycleDay(workOrder.status) && !shouldSnapshotLifecycleDay(statusForGate)) {
    return null
  }
  if (DAILY_LOG_READONLY_STATUSES.has(workOrder.status) && !shouldSnapshotLifecycleDay(statusForGate)) {
    throw httpError('Daily field snapshots cannot be edited after the work order is completed.')
  }

  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const snapshot = normalizeFieldSnapshot(
    rawSnapshot || buildFieldSnapshotFromLifecycle(body || {}, workOrder, body?.process_extras || {}),
    { fieldLimits },
  )
  const legacy = legacyColumnsFromSnapshot(snapshot)
  const logDate = todayDateString(timeZone)
  const now = new Date().toISOString()
  const { logs } = await listWorkOrderDailyLogs(orgId, workOrderId)
  const existingToday = logs.find((row) => row.log_date === logDate)

  // Close any prior open days so calendar rollover does not leave stale "open" rows.
  const priorOpen = logs.filter((row) => row.day_status === 'open' && row.log_date !== logDate)
  if (priorOpen.length) {
    const { error: closeError } = await supabaseAdmin
      .from('work_order_daily_logs')
      .update({
        day_status: 'closed',
        ended_at: now,
        updated_by: profileId,
        updated_at: now,
      })
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .eq('day_status', 'open')
      .neq('log_date', logDate)
    if (closeError) throw closeError
  }

  let row
  if (existingToday) {
    const { data, error } = await supabaseAdmin
      .from('work_order_daily_logs')
      .update({
        field_snapshot: snapshot,
        work_done: legacy.work_done,
        remarks: legacy.remarks,
        labour_count: legacy.labour_count,
        materials: legacy.materials,
        day_status: 'open',
        ended_at: now,
        updated_by: profileId,
        updated_at: now,
      })
      .eq('id', existingToday.id)
      .eq('org_id', orgId)
      .eq('work_order_id', workOrderId)
      .select('*')
      .single()
    if (error) throw error
    row = data
  } else {
    const { data, error } = await supabaseAdmin
      .from('work_order_daily_logs')
      .insert({
        org_id: orgId,
        work_order_id: workOrderId,
        log_date: logDate,
        started_at: now,
        ended_at: now,
        day_status: 'open',
        field_snapshot: snapshot,
        work_done: legacy.work_done,
        remarks: legacy.remarks,
        labour_count: legacy.labour_count,
        materials: legacy.materials,
        created_by: profileId,
        updated_by: profileId,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Race: update instead
        const { data: raced, error: raceError } = await supabaseAdmin
          .from('work_order_daily_logs')
          .update({
            field_snapshot: snapshot,
            work_done: legacy.work_done,
            remarks: legacy.remarks,
            labour_count: legacy.labour_count,
            materials: legacy.materials,
            day_status: 'open',
            ended_at: now,
            updated_by: profileId,
            updated_at: now,
          })
          .eq('org_id', orgId)
          .eq('work_order_id', workOrderId)
          .eq('log_date', logDate)
          .select('*')
          .single()
        if (raceError) throw raceError
        row = raced
      } else {
        throw error
      }
    } else {
      row = data
    }
  }

  const refreshed = await listWorkOrderDailyLogs(orgId, workOrderId)
  await syncWorkOrderFromLogs(orgId, workOrderId, refreshed.logs)

  await addWorkOrderTimelineEvent(
    orgId,
    workOrderId,
    existingToday ? 'daily_log_updated' : 'daily_log_started',
    existingToday
      ? `Execution fields saved for ${logDate}.`
      : `Execution fields started for ${logDate}.`,
    profileId,
    { metadata: { daily_log_id: row.id, log_date: logDate } },
  )

  return row
}

export async function startWorkOrderDay(orgId, profileId, workOrderId, { timeZone } = {}) {
  const workOrder = await loadWorkOrder(orgId, workOrderId)
  assertCanEditLogs(workOrder)
  const logDate = todayDateString(timeZone)
  const { logs } = await listWorkOrderDailyLogs(orgId, workOrderId)
  const existingToday = logs.find((row) => row.log_date === logDate)
  if (existingToday) return existingToday
  return upsertWorkOrderDaySnapshot(orgId, profileId, workOrderId, {
    timeZone,
    snapshot: {
      checklist_values: {},
      process_extras: {},
      material_rows: [],
    },
    existing: workOrder,
  })
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

  const fieldLimits = await getTextFieldLimitsMap(orgId)
  const prevSnap = normalizeFieldSnapshot(existing.field_snapshot || {
    work_done: existing.work_done,
    remarks: existing.remarks,
    labour_count: existing.labour_count,
    material_rows: existing.materials,
  })
  const nextSnap = normalizeFieldSnapshot({
    ...prevSnap,
    ...(body.field_snapshot && typeof body.field_snapshot === 'object' ? body.field_snapshot : {}),
    work_done: body.work_done !== undefined ? body.work_done : prevSnap.work_done,
    remarks: body.remarks !== undefined ? body.remarks : prevSnap.remarks,
    labour_count: body.labour_count !== undefined ? body.labour_count : prevSnap.labour_count,
    material_rows: body.materials !== undefined ? body.materials : prevSnap.material_rows,
  }, { fieldLimits })
  const legacy = legacyColumnsFromSnapshot(nextSnap)

  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .update({
      field_snapshot: nextSnap,
      work_done: legacy.work_done,
      remarks: legacy.remarks,
      labour_count: legacy.labour_count,
      materials: legacy.materials,
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    })
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
    `Daily field snapshot updated for ${existing.log_date}.`,
    profileId,
    { metadata: { daily_log_id: logId, log_date: existing.log_date } },
  )

  return data
}

export async function endWorkOrderDay(orgId, profileId, workOrderId, logId, body = {}) {
  // Kept for API compatibility: closing a day just marks it closed after saving fields.
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

  if (body && Object.keys(body).length) {
    await updateWorkOrderDailyLog(orgId, profileId, workOrderId, logId, body)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('work_order_daily_logs')
    .update({
      day_status: 'closed',
      ended_at: body.ended_at || now,
      updated_by: profileId,
      updated_at: now,
    })
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
    `Daily field snapshot closed for ${existing.log_date}.`,
    profileId,
    { metadata: { daily_log_id: logId, log_date: existing.log_date } },
  )

  return data
}
