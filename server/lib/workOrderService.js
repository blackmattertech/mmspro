import { supabaseAdmin } from '../services/supabase.js'
import { notifyWorkOrderParties } from '../services/notifications.js'
import { loadTimelineActors } from './timelineActors.js'

export const WO_STATUSES = [
  'draft',
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'completed',
  'verified',
  'closed',
  'returned_rework',
]

export const WO_ACTIVE_STATUSES = WO_STATUSES.filter((s) => s !== 'draft' && s !== 'closed')

export const WO_OPEN_LIST_STATUSES = [
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'returned_rework',
]

export const WO_ASSIGNED_LIST_STATUSES = WO_STATUSES.filter((status) => status !== 'draft')

export const PERMIT_TYPES = [
  'hot_work',
  'cold_work',
  'confined_space',
  'excavation',
  'electrical_isolation',
  'loto',
  'height_work',
  'radiography',
]

export const SOURCE_TYPES = [
  'approved_work_request',
  'preventive_maintenance',
  'manual',
  'breakdown',
  'user_self_request',
]

/** Allowed transitions: from → to[] */
export const STATUS_TRANSITIONS = {
  draft: ['assigned'],
  assigned: ['accepted', 'returned_rework'],
  accepted: ['started'],
  started: ['in_progress', 'waiting_material', 'waiting_shutdown', 'on_hold', 'completed'],
  in_progress: ['waiting_material', 'waiting_shutdown', 'on_hold', 'completed'],
  waiting_material: ['in_progress', 'started', 'on_hold', 'completed'],
  waiting_shutdown: ['in_progress', 'started', 'on_hold', 'completed'],
  on_hold: ['in_progress', 'started', 'waiting_material', 'waiting_shutdown'],
  returned_rework: ['assigned', 'accepted', 'started', 'in_progress'],
  completed: ['verified', 'returned_rework'],
  verified: ['closed', 'returned_rework'],
  closed: [],
}

const COMPLETION_REQUIRED_FIELDS = [
  ['work_start_at', 'Work start time'],
  ['work_end_at', 'Work end time'],
  ['job_description', 'Detailed job description'],
  ['root_cause', 'Root cause analysis'],
  ['action_taken', 'Action taken'],
  ['material_consumed', 'Material consumed'],
]

function formatSeqDate(date = new Date()) {
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return { label: `${yy}${mm}${dd}`, iso: date.toISOString().slice(0, 10) }
}

function sanitizeDeptCode(code) {
  return String(code || 'GEN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'GEN'
}

export async function generateWorkOrderNumber(orgId, departmentId) {
  const { data: dept, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('code')
    .eq('org_id', orgId)
    .eq('id', departmentId)
    .maybeSingle()

  if (deptError) throw deptError
  const code = sanitizeDeptCode(dept?.code)
  const { label, iso } = formatSeqDate()

  const { data: existing, error: readError } = await supabaseAdmin
    .from('work_order_daily_sequences')
    .select('last_number')
    .eq('org_id', orgId)
    .eq('department_id', departmentId)
    .eq('seq_date', iso)
    .maybeSingle()

  if (readError) throw readError

  const next = (existing?.last_number || 0) + 1

  const { error: upsertError } = await supabaseAdmin
    .from('work_order_daily_sequences')
    .upsert(
      {
        org_id: orgId,
        department_id: departmentId,
        seq_date: iso,
        last_number: next,
      },
      { onConflict: 'org_id,department_id,seq_date' },
    )

  if (upsertError) throw upsertError

  return `WO-${code}-${label}-${String(next).padStart(4, '0')}`
}

export async function addWorkOrderTimelineEvent(
  orgId,
  workOrderId,
  eventType,
  message,
  actorId,
  { previousStatus = null, newStatus = null, remarks = null, metadata = {} } = {},
) {
  const { error } = await supabaseAdmin.from('work_order_timeline').insert({
    org_id: orgId,
    work_order_id: workOrderId,
    event_type: eventType,
    message,
    actor_id: actorId,
    previous_status: previousStatus,
    new_status: newStatus,
    remarks,
    metadata,
  })
  if (error) throw error
}

export async function addWorkOrderAuditEntry(
  orgId,
  workOrderId,
  actorId,
  action,
  { previousStatus = null, newStatus = null, remarks = null, departmentId = null, metadata = {} } = {},
) {
  const { error } = await supabaseAdmin.from('work_order_audit_log').insert({
    org_id: orgId,
    work_order_id: workOrderId,
    actor_id: actorId,
    department_id: departmentId,
    action,
    previous_status: previousStatus,
    new_status: newStatus,
    remarks,
    metadata,
  })
  if (error) throw error
}

export async function syncWorkRequestFromWorkOrder(orgId, workOrder, eventType, message, actorId, metadata = {}) {
  if (!workOrder?.work_request_id) return

  const now = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('work_requests')
    .update({
      execution_status: workOrder.status,
      updated_at: now,
    })
    .eq('org_id', orgId)
    .eq('id', workOrder.work_request_id)

  if (updateError) throw updateError

  const { error: timelineError } = await supabaseAdmin.from('work_request_timeline').insert({
    org_id: orgId,
    work_request_id: workOrder.work_request_id,
    event_type: eventType,
    message,
    actor_id: actorId,
    metadata: {
      ...metadata,
      work_order_id: workOrder.id,
      wo_number: workOrder.wo_number || null,
      status: workOrder.status,
    },
  })
  if (timelineError) throw timelineError
}

export function assertValidTransition(fromStatus, toStatus) {
  const allowed = STATUS_TRANSITIONS[fromStatus] || []
  if (!allowed.includes(toStatus)) {
    const err = new Error(
      `Cannot change status from ${fromStatus.replace(/_/g, ' ')} to ${toStatus.replace(/_/g, ' ')}.`,
    )
    err.status = 400
    throw err
  }
}

export function isPermitComplete(workOrder) {
  if (!workOrder?.permit_required) return true
  const types = Array.isArray(workOrder.permit_types) ? workOrder.permit_types : []
  if (!types.length) return false

  const details = Array.isArray(workOrder.permit_details) ? workOrder.permit_details : []
  if (details.length) {
    return types.every((type) => {
      const row = details.find((item) => item?.type === type)
      return Boolean(row && String(row.number || '').trim() && row.issue_at)
    })
  }

  // Legacy single permit fields
  return Boolean(
    String(workOrder.permit_number || '').trim()
    && workOrder.permit_issue_at,
  )
}

function sanitizePermitDetails(raw, allowedTypes = PERMIT_TYPES) {
  const allowed = new Set(allowedTypes)
  const list = Array.isArray(raw) ? raw : []
  const byType = new Map()
  for (const row of list) {
    const type = String(row?.type || '').trim()
    if (!allowed.has(type) || byType.has(type)) continue
    byType.set(type, {
      type,
      number: String(row?.number || '').trim(),
      issue_at: row?.issue_at || null,
      expiry_at: row?.expiry_at || null,
    })
  }
  return [...byType.values()]
}

export function validatePermitForStart(workOrder) {
  if (!isPermitComplete(workOrder)) {
    const err = new Error(
      'Permit details must be completed before starting work when a permit is required.',
    )
    err.status = 400
    throw err
  }
}

export function validateCompletionFields(workOrder) {
  const missing = []
  for (const [key, label] of COMPLETION_REQUIRED_FIELDS) {
    const value = workOrder?.[key]
    if (value == null || (typeof value === 'string' && !value.trim())) {
      missing.push(label)
    }
  }
  if (!workOrder?.work_duration_hours && workOrder?.work_start_at && workOrder?.work_end_at) {
    // duration can be auto-calculated later; not blocking if times exist
  } else if (workOrder?.work_start_at && workOrder?.work_end_at && !workOrder?.work_duration_hours) {
    // ok — will compute on save
  }

  if (workOrder?.permit_required && !isPermitComplete(workOrder)) {
    missing.push('Permit details')
  }

  if (missing.length) {
    const err = new Error(`Complete required fields before marking completed: ${missing.join(', ')}.`)
    err.status = 400
    throw err
  }
}

function hoursBetween(startAt, endAt) {
  if (!startAt || !endAt) return null
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round(((end - start) / 3600000) * 100) / 100
}

function sanitizeAttachmentList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return null
    const path = String(item.path || '').trim()
    if (!path) return null
    const size = Number(item.size)
    return {
      path,
      name: String(item.name || item.file_name || 'file'),
      mime_type: item.mime_type || item.type || null,
      size: Number.isFinite(size) ? size : null,
      bucket: item.bucket || 'work-order-assets',
      source: item.source === 'execution' ? 'execution' : (item.source || null),
    }
  }).filter(Boolean)
}

export function computeDurations(patch, existing = {}) {
  const next = { ...patch }
  const start = next.work_start_at ?? existing.work_start_at
  const end = next.work_end_at ?? existing.work_end_at
  if (start && end) {
    next.work_duration_hours = hoursBetween(start, end)
  }

  const bStart = next.breakdown_start_at ?? existing.breakdown_start_at
  const bEnd = next.breakdown_end_at ?? existing.breakdown_end_at
  if (bStart && bEnd) {
    next.breakdown_duration_hours = hoursBetween(bStart, bEnd)
  }

  const pStart = next.planned_start_at ?? existing.planned_start_at
  const pEnd = next.planned_end_at ?? existing.planned_end_at
  if (pStart && pEnd && next.planned_duration_hours == null && existing.planned_duration_hours == null) {
    next.planned_duration_hours = hoursBetween(pStart, pEnd)
  }

  return next
}

export function mapRequestTypeToSource(requestType) {
  if (requestType === 'user_self') return 'user_self_request'
  if (requestType === 'manual') return 'manual'
  return 'approved_work_request'
}

export async function loadWorkOrderTimeline(orgId, workOrderId) {
  const { data, error } = await supabaseAdmin
    .from('work_order_timeline')
    .select('id, event_type, message, actor_id, previous_status, new_status, remarks, metadata, created_at')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true })

  if (error) throw error
  const rows = data || []
  const actorIds = [...new Set(rows.map((event) => event.actor_id).filter(Boolean))]
  const actorById = await loadTimelineActors(orgId, actorIds)
  return rows.map((event) => ({
    ...event,
    actor: event.actor_id ? (actorById.get(event.actor_id) || null) : null,
  }))
}

export async function updateWorkOrderLifecycle(orgId, profileId, workOrderId, body = {}) {
  const { data: existing, error } = await supabaseAdmin
    .from('manual_work_orders')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()

  if (error) throw error
  if (!existing) {
    const err = new Error('Work order not found.')
    err.status = 404
    throw err
  }

  const nextStatus = body.status || existing.status
  if (nextStatus !== existing.status) {
    assertValidTransition(existing.status, nextStatus)
  }

  let patch = {}

  const scalarKeys = [
    'priority',
    'work_center',
    'special_instructions',
    'planned_start_at',
    'planned_end_at',
    'planned_duration_hours',
    'permit_required',
    'permit_number',
    'permit_issue_at',
    'permit_expiry_at',
    'work_start_at',
    'work_end_at',
    'vendor_expense',
    'vendor_currency',
    'labour_count',
    'breakdown_start_at',
    'breakdown_end_at',
    'job_description',
    'root_cause',
    'action_taken',
    'material_consumed',
    'special_tools_used',
    'safety_precautions',
    'dos_and_donts',
    'lessons_learned',
    'execution_remarks',
    'verification_remarks',
  ]

  for (const key of scalarKeys) {
    if (body[key] !== undefined) patch[key] = body[key]
  }

  if (body.permit_types !== undefined || body.permit_details !== undefined) {
    const existingTypes = Array.isArray(existing.permit_types) ? existing.permit_types : []
    const nextTypes = body.permit_types !== undefined
      ? (Array.isArray(body.permit_types)
        ? body.permit_types.filter((t) => PERMIT_TYPES.includes(t))
        : [])
      : existingTypes
    const nextDetails = sanitizePermitDetails(
      body.permit_details !== undefined ? body.permit_details : existing.permit_details,
      nextTypes,
    ).filter((row) => nextTypes.includes(row.type))

    // Keep a detail shell for every selected type
    const detailByType = new Map(nextDetails.map((row) => [row.type, row]))
    const syncedDetails = nextTypes.map((type) => detailByType.get(type) || {
      type,
      number: '',
      issue_at: null,
      expiry_at: null,
    })

    patch.permit_types = nextTypes
    patch.permit_details = syncedDetails

    const primary = syncedDetails[0]
    patch.permit_number = primary?.number || null
    patch.permit_issue_at = primary?.issue_at || null
    patch.permit_expiry_at = primary?.expiry_at || null
  }

  if (body.permit_attachments !== undefined && Array.isArray(body.permit_attachments)) {
    patch.permit_attachments = sanitizeAttachmentList(body.permit_attachments)
  }

  if (body.execution_attachments !== undefined && Array.isArray(body.execution_attachments)) {
    const requestFiles = sanitizeAttachmentList(existing.attachments)
      .filter((file) => file.source !== 'execution')
    const executionFiles = sanitizeAttachmentList(body.execution_attachments)
      .map((file) => ({ ...file, source: 'execution' }))
    patch.attachments = [...requestFiles, ...executionFiles]
  }

  if (body.vendor_id !== undefined) patch.vendor_id = body.vendor_id || null

  if (body.checklist_values !== undefined && body.checklist_values && typeof body.checklist_values === 'object') {
    patch.checklist_values = body.checklist_values
  }

  patch = computeDurations(patch, existing)

  if (nextStatus !== existing.status) {
    if (['started', 'in_progress'].includes(nextStatus) && existing.status !== 'started') {
      validatePermitForStart({ ...existing, ...patch })
    }
    if (nextStatus === 'completed') {
      validateCompletionFields({ ...existing, ...patch, status: nextStatus })
    }
    if (nextStatus === 'verified') {
      patch.verified_by = profileId
      patch.verified_at = new Date().toISOString()
    }
    if (nextStatus === 'closed') {
      patch.closed_by = profileId
      patch.closed_at = new Date().toISOString()
    }
    patch.status = nextStatus
  }

  const now = new Date().toISOString()
  patch.updated_at = now

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('manual_work_orders')
    .update(patch)
    .eq('id', workOrderId)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (updateError) throw updateError

  if (nextStatus !== existing.status) {
    const label = nextStatus.replace(/_/g, ' ')
    const message = body.remarks?.trim()
      || `Work order status updated to ${label}.`
    await addWorkOrderTimelineEvent(
      orgId,
      workOrderId,
      `status_${nextStatus}`,
      message,
      profileId,
      {
        previousStatus: existing.status,
        newStatus: nextStatus,
        remarks: body.remarks || null,
      },
    )
    await addWorkOrderAuditEntry(
      orgId,
      workOrderId,
      profileId,
      'status_change',
      {
        previousStatus: existing.status,
        newStatus: nextStatus,
        remarks: body.remarks || null,
      },
    )
    await syncWorkRequestFromWorkOrder(
      orgId,
      updated,
      `wo_${nextStatus}`,
      `Linked work order ${updated.wo_number || ''} — ${message}`.trim(),
      profileId,
    )

    try {
      await notifyWorkOrderParties(orgId, updated, {
        title: 'Work order update',
        body: `${updated.wo_number || 'Work order'}: ${label}`,
        data: {
          work_order_id: updated.id,
          type: 'work_order_status',
          status: nextStatus,
          actor_id: profileId,
          message: body.remarks || null,
        },
        url: '/',
      }, { actorId: profileId })
    } catch {
      // non-blocking
    }

    if (nextStatus === 'closed' && updated.source_type === 'preventive_maintenance' && updated.pm_plan_id) {
      try {
        const { advancePlanAfterWorkOrderClose } = await import('./pmService.js')
        await advancePlanAfterWorkOrderClose(orgId, updated)
      } catch (err) {
        console.error('Failed to advance PM next due date:', err.message)
      }
    }
  } else if (Object.keys(patch).length > 1) {
    await addWorkOrderTimelineEvent(
      orgId,
      workOrderId,
      'details_updated',
      body.remarks?.trim() || 'Work order details updated.',
      profileId,
      { remarks: body.remarks || null },
    )
  }

  return updated
}

export function displayWorkOrderNumber(row) {
  if (row?.wo_number) return row.wo_number
  return String(row?.id || '').slice(0, 8).toUpperCase()
}
