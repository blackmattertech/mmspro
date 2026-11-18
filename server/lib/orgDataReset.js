import { createHash, randomInt } from 'node:crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { SCHEDULED_WO_SOURCE } from './workOrderOrigin.js'

const CHUNK = 100
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RESEND_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function isMissingTable(error) {
  return /does not exist|Could not find the table|schema cache/i.test(error?.message || '')
}

/**
 * Allowlisted module reset targets.
 * tables[].mode:
 *   - org_id: delete WHERE org_id = :orgId (by id chunks when possible)
 *   - org_id_no_id: delete WHERE org_id = :orgId (composite PK / no uuid id)
 *   - wo_children / wo_rows: scoped to filtered work-order ids
 */
export const ORG_RESET_TARGETS = [
  {
    id: 'logbook',
    label: 'Meter readings',
    tables: [
      { name: 'equipment_meter_readings', label: 'Meter readings', mode: 'org_id' },
    ],
    storage: [],
    sideEffectNotes: [],
  },
  {
    id: 'warranty_manager',
    label: 'Warranty Manager',
    tables: [
      { name: 'warranty_documents', label: 'Warranty documents', mode: 'org_id' },
      { name: 'warranty_items', label: 'Warranty items', mode: 'org_id' },
      { name: 'warranty_expiry_alerts', label: 'Expiry alerts', mode: 'org_id' },
      { name: 'warranties', label: 'Warranties', mode: 'org_id' },
    ],
    storage: [{ bucket: 'org-assets', prefix: 'warranties' }],
    sideEffectNotes: [],
  },
  {
    id: 'support_tickets',
    label: 'Support & Tickets',
    tables: [
      { name: 'support_ticket_messages', label: 'Support messages', mode: 'org_id' },
      { name: 'support_ticket_events', label: 'Support events', mode: 'org_id' },
      { name: 'support_tickets', label: 'Support tickets', mode: 'org_id' },
    ],
    storage: [{ bucket: 'support-ticket-assets', prefix: 'support' }],
    sideEffectNotes: [],
  },
  {
    id: 'tasks_followups',
    label: 'Tasks',
    tables: [
      { name: 'task_activities', label: 'Task activities', mode: 'org_id' },
      { name: 'task_comments', label: 'Task comments', mode: 'org_id' },
      { name: 'task_attachments', label: 'Task attachments', mode: 'org_id' },
      { name: 'task_links', label: 'Task links', mode: 'org_id' },
      { name: 'task_reminders', label: 'Task reminders', mode: 'org_id' },
      { name: 'task_recurrence', label: 'Task recurrence', mode: 'org_id' },
      { name: 'task_assignees', label: 'Task assignees', mode: 'org_id' },
      { name: 'task_tag_assignments', label: 'Task tag assignments', mode: 'org_id' },
      { name: 'task_references', label: 'Task references', mode: 'org_id' },
      { name: 'tasks', label: 'Tasks', mode: 'org_id' },
      { name: 'task_sequences', label: 'Task sequences', mode: 'org_id_no_id' },
    ],
    storage: [{ bucket: 'org-assets', prefix: 'tasks' }],
    sideEffectNotes: [],
  },
  {
    id: 'work_request',
    label: 'Work Request',
    tables: [
      { name: 'work_request_timeline', label: 'WR timeline', mode: 'org_id' },
      { name: 'work_requests', label: 'Work requests', mode: 'org_id' },
      { name: 'work_request_daily_sequences', label: 'WR sequences', mode: 'org_id_no_id' },
    ],
    storage: [{ bucket: 'work-order-assets', prefix: 'work-requests' }],
    sideEffectNotes: [
      'Linked work orders keep their rows; work_request_id becomes empty where set.',
    ],
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    woFilter: 'non_pm',
    tables: [
      { name: 'work_order_daily_logs', label: 'Daily logs', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'work_order_timeline', label: 'WO timeline', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'work_order_audit_log', label: 'WO audit log', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_order_assignees', label: 'WO assignees', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_order_values', label: 'WO field values', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_orders', label: 'Work orders', mode: 'wo_rows' },
    ],
    storage: [{ bucket: 'work-order-assets', prefix: null, byWorkOrderIds: true }],
    sideEffectNotes: [
      'Only non-PM work orders are cleared. Scheduled/PM work orders are kept.',
      'Linked work requests keep their rows; manual_work_order_id becomes empty where set.',
    ],
  },
  {
    id: 'work_orders_scheduled',
    label: 'PM Schedule',
    woFilter: 'pm',
    tables: [
      { name: 'work_order_daily_logs', label: 'PM WO daily logs', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'work_order_timeline', label: 'PM WO timeline', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'work_order_audit_log', label: 'PM WO audit log', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_order_assignees', label: 'PM WO assignees', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_order_values', label: 'PM WO field values', mode: 'wo_children', parent: 'work_order_id' },
      { name: 'manual_work_orders', label: 'PM work orders', mode: 'wo_rows' },
      { name: 'pm_plan_audit', label: 'PM plan audit', mode: 'org_id' },
      { name: 'pm_plan_technicians', label: 'PM technicians', mode: 'org_id_no_id' },
      { name: 'pm_plans', label: 'PM plans', mode: 'org_id' },
      { name: 'pm_plan_daily_sequences', label: 'PM sequences', mode: 'org_id_no_id' },
    ],
    storage: [{ bucket: 'work-order-assets', prefix: null, byWorkOrderIds: true }],
    sideEffectNotes: [
      'Only preventive-maintenance work orders and PM plans are cleared.',
      'Checklist templates are kept.',
    ],
  },
  {
    id: 'equipment',
    label: 'Assets',
    tables: [
      { name: 'equipment_meter_readings', label: 'Meter readings', mode: 'org_id' },
      { name: 'equipment_values', label: 'Asset field values', mode: 'org_id' },
      { name: 'equipment', label: 'Assets', mode: 'org_id' },
    ],
    storage: [{ bucket: 'org-assets', prefix: 'equipment' }],
    sideEffectNotes: [
      'Work requests, work orders, and PM plans keep their rows; equipment links become empty.',
      'Asset field definitions (schema) are kept.',
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    tables: [
      { name: 'report_ready_reports', label: 'Ready reports', mode: 'org_id' },
      { name: 'report_schedules', label: 'Report schedules', mode: 'org_id' },
      { name: 'report_custom_reports', label: 'Custom reports', mode: 'org_id' },
    ],
    storage: [{ bucket: 'report-ready-assets', prefix: 'ready' }],
    sideEffectNotes: [
      'Deletes generated PDF/CSV artifacts from Ready Reports storage.',
    ],
  },
  {
    id: 'import_jobs',
    label: 'Import jobs',
    tables: [
      { name: 'import_jobs', label: 'Background imports', mode: 'org_id' },
    ],
    storage: [{ bucket: 'import-job-assets', prefix: 'imports' }],
    sideEffectNotes: [
      'Deletes queued/completed Excel import job records and stored source/failed files.',
    ],
  },
  {
    id: 'vendors',
    label: 'Vendors',
    tables: [
      { name: 'vendors', label: 'Vendors', mode: 'org_id' },
    ],
    storage: [],
    sideEffectNotes: [
      'Warranty, task, PM, and work-order vendor links become empty where set.',
    ],
  },
  {
    id: 'work_centers',
    label: 'Work Centers',
    tables: [
      { name: 'work_centers', label: 'Work centers', mode: 'org_id' },
    ],
    storage: [],
    sideEffectNotes: [
      'Historical work-center text on work orders is not changed.',
    ],
  },
  {
    id: 'uoms',
    label: 'UOM',
    tables: [
      { name: 'org_uoms', label: 'Units of measure', mode: 'org_id' },
    ],
    storage: [],
    sideEffectNotes: [],
  },
  {
    id: 'others',
    label: 'Checklists',
    tables: [
      { name: 'checklist_template_fields', label: 'Checklist fields', mode: 'org_id' },
      { name: 'checklist_template_sections', label: 'Checklist sections', mode: 'org_id' },
      { name: 'checklist_templates', label: 'Checklist templates', mode: 'org_id' },
    ],
    storage: [],
    sideEffectNotes: [
      'Work orders and PM plans keep their rows; checklist template links become empty.',
    ],
  },
]

const TARGET_BY_ID = new Map(ORG_RESET_TARGETS.map((t) => [t.id, t]))

export function getOrgResetTarget(targetId) {
  const id = String(targetId || '').trim()
  return TARGET_BY_ID.get(id) || null
}

export function assertOrgResetTarget(targetId) {
  const target = getOrgResetTarget(targetId)
  if (!target) throw httpError('Unknown reset module', 400)
  return target
}

async function countOrgRowsNoId(table, orgId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) {
    if (isMissingTable(error)) return 0
    throw error
  }
  return count || 0
}

async function countOrgRows(table, orgId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (!error) return count || 0
  if (isMissingTable(error)) return 0

  // Composite PK / no uuid id: PostgREST often returns an empty message for bad columns.
  // Retry with * so allowlisted sequence/junction tables still report counts.
  const retry = await countOrgRowsNoId(table, orgId)
  return retry
}

async function countFilteredWorkOrders(orgId, woFilter) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (woFilter === 'non_pm') query = query.neq('source_type', SCHEDULED_WO_SOURCE)
  else if (woFilter === 'pm') query = query.eq('source_type', SCHEDULED_WO_SOURCE)
  const { count, error } = await query
  if (error) {
    if (isMissingTable(error)) return 0
    throw error
  }
  return count || 0
}

async function listFilteredWorkOrderIds(orgId, woFilter) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id')
    .eq('org_id', orgId)
  if (woFilter === 'non_pm') query = query.neq('source_type', SCHEDULED_WO_SOURCE)
  else if (woFilter === 'pm') query = query.eq('source_type', SCHEDULED_WO_SOURCE)
  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data || []).map((row) => row.id).filter(Boolean)
}

async function countByParentIds(table, orgId, parentColumn, parentIds) {
  if (!parentIds.length) return 0
  let total = 0
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const chunk = parentIds.slice(i, i + CHUNK)
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in(parentColumn, chunk)
    if (error) {
      if (isMissingTable(error)) return 0
      throw error
    }
    total += count || 0
  }
  return total
}

export async function listOrgResetTargets(orgId) {
  if (!orgId) throw httpError('Organization is required', 400)

  const results = []
  for (const target of ORG_RESET_TARGETS) {
    const woIds = target.woFilter
      ? await listFilteredWorkOrderIds(orgId, target.woFilter)
      : null

    const tables = []
    let totalRows = 0
    for (const table of target.tables) {
      let count = 0
      if (table.mode === 'wo_rows') {
        count = await countFilteredWorkOrders(orgId, target.woFilter)
      } else if (table.mode === 'wo_children') {
        count = await countByParentIds(table.name, orgId, table.parent, woIds || [])
      } else if (table.mode === 'org_id_no_id') {
        count = await countOrgRowsNoId(table.name, orgId)
      } else {
        count = await countOrgRows(table.name, orgId)
      }
      tables.push({
        name: table.name,
        label: table.label,
        count,
      })
      totalRows += count
    }

    results.push({
      id: target.id,
      label: target.label,
      tables,
      totalRows,
      sideEffectNotes: target.sideEffectNotes || [],
    })
  }
  return results
}

async function deleteIds(table, ids, { dryRun }) {
  if (!ids.length) return 0
  if (dryRun) return ids.length
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await supabaseAdmin.from(table).delete().in('id', chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  return ids.length
}

async function deleteOrgRowsById(table, orgId, { dryRun }) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('org_id', orgId)
  if (error) {
    if (isMissingTable(error)) return 0
    throw error
  }
  const ids = (data || []).map((row) => row.id).filter(Boolean)
  return deleteIds(table, ids, { dryRun })
}

async function deleteOrgRowsNoId(table, orgId, { dryRun }) {
  const { count, error: countError } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (countError) {
    if (isMissingTable(countError)) return 0
    throw countError
  }
  const n = count || 0
  if (!n) return 0
  if (dryRun) return n
  const { error } = await supabaseAdmin.from(table).delete().eq('org_id', orgId)
  if (error) throw new Error(`${table}: ${error.message}`)
  return n
}

async function deleteByParentIds(table, orgId, parentColumn, parentIds, { dryRun }) {
  if (!parentIds.length) return 0
  let total = 0
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const chunk = parentIds.slice(i, i + CHUNK)
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('org_id', orgId)
      .in(parentColumn, chunk)
    if (error) {
      if (isMissingTable(error)) return total
      throw error
    }
    const ids = (data || []).map((row) => row.id).filter(Boolean)
    total += await deleteIds(table, ids, { dryRun })
  }
  return total
}

async function listStorageFiles(bucket, prefix = '') {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  })
  if (error) {
    if (/not found|does not exist/i.test(error.message || '')) return []
    throw error
  }
  const paths = []
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id == null && !entry.metadata) {
      paths.push(...(await listStorageFiles(bucket, path)))
    } else {
      paths.push(path)
    }
  }
  return paths
}

async function wipeStoragePrefixes(orgId, storageSpecs, workOrderIds, { dryRun }) {
  let total = 0
  for (const spec of storageSpecs || []) {
    const prefixes = []
    if (spec.byWorkOrderIds) {
      for (const woId of workOrderIds || []) {
        prefixes.push(`${orgId}/${woId}`)
      }
    } else if (spec.prefix) {
      prefixes.push(`${orgId}/${spec.prefix}`)
    } else {
      continue
    }

    for (const prefix of prefixes) {
      let paths
      try {
        paths = await listStorageFiles(spec.bucket, prefix)
      } catch (err) {
        console.warn(`orgDataReset storage skip ${spec.bucket}/${prefix}:`, err.message)
        continue
      }
      if (!paths.length) continue
      if (!dryRun) {
        for (let i = 0; i < paths.length; i += CHUNK) {
          const chunk = paths.slice(i, i + CHUNK)
          const { error } = await supabaseAdmin.storage.from(spec.bucket).remove(chunk)
          if (error) throw error
        }
      }
      total += paths.length
    }
  }
  return total
}

/**
 * Reset one allowlisted module for a single organization.
 */
export async function resetOrgModuleData(orgId, targetId, { dryRun = false, actor = null } = {}) {
  if (!orgId) throw httpError('Organization is required', 400)
  const target = assertOrgResetTarget(targetId)

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle()
  if (orgError) throw orgError
  if (!org) throw httpError('Organization not found', 404)

  const woIds = target.woFilter
    ? await listFilteredWorkOrderIds(orgId, target.woFilter)
    : []

  const tableCounts = {}
  let totalRows = 0

  for (const table of target.tables) {
    let deleted = 0
    if (table.mode === 'org_id') {
      deleted = await deleteOrgRowsById(table.name, orgId, { dryRun })
    } else if (table.mode === 'org_id_no_id') {
      deleted = await deleteOrgRowsNoId(table.name, orgId, { dryRun })
    } else if (table.mode === 'wo_children') {
      deleted = await deleteByParentIds(table.name, orgId, table.parent, woIds, { dryRun })
    } else if (table.mode === 'wo_rows') {
      deleted = await deleteIds('manual_work_orders', woIds, { dryRun })
    } else {
      throw httpError(`Unsupported reset mode for ${table.name}`, 500)
    }
    tableCounts[table.name] = deleted
    totalRows += deleted
  }

  const storageObjects = await wipeStoragePrefixes(orgId, target.storage, woIds, { dryRun })

  const result = {
    organization: org,
    targetId: target.id,
    targetLabel: target.label,
    dryRun: Boolean(dryRun),
    counts: {
      totalRows,
      tables: tableCounts,
      storageObjects,
    },
  }

  console.info('[orgDataReset]', JSON.stringify({
    orgId,
    targetId: target.id,
    dryRun: Boolean(dryRun),
    actorId: actor?.id || null,
    actorRole: actor?.role || null,
    counts: result.counts,
    at: new Date().toISOString(),
  }))

  return result
}

export function hashOrgResetOtp(code, orgId) {
  return createHash('sha256')
    .update(`org-data-reset:${orgId}:${String(code || '').trim()}`)
    .digest('hex')
}

export function generateOrgResetOtpCode() {
  return String(randomInt(100000, 1000000))
}

export async function createOrgResetOtp({ orgId, targetId, requestedBy, email }) {
  const target = assertOrgResetTarget(targetId)
  if (!requestedBy) throw httpError('Requester is required', 400)
  if (!email) throw httpError('A verified email is required to send the OTP', 400)

  const { data: recent, error: recentError } = await supabaseAdmin
    .from('org_data_reset_otps')
    .select('id, created_at')
    .eq('org_id', orgId)
    .eq('requested_by', requestedBy)
    .eq('target_id', target.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentError && !isMissingTable(recentError)) throw recentError
  if (recent?.created_at) {
    const age = Date.now() - new Date(recent.created_at).getTime()
    if (age < OTP_RESEND_MS) {
      const waitSec = Math.ceil((OTP_RESEND_MS - age) / 1000)
      throw httpError(`Wait ${waitSec}s before requesting another code`, 429)
    }
  }

  // Invalidate prior unused OTPs for this actor/target
  if (!isMissingTable(recentError)) {
    await supabaseAdmin
      .from('org_data_reset_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('requested_by', requestedBy)
      .eq('target_id', target.id)
      .is('consumed_at', null)
  }

  const code = generateOrgResetOtpCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('org_data_reset_otps')
    .insert({
      org_id: orgId,
      target_id: target.id,
      requested_by: requestedBy,
      email: String(email).trim().toLowerCase(),
      code_hash: hashOrgResetOtp(code, orgId),
      expires_at: expiresAt,
      attempts: 0,
    })
    .select('id, expires_at')
    .single()

  if (error) {
    if (isMissingTable(error)) {
      throw httpError('Reset OTP storage is not configured. Apply supabase patch 123-org-data-reset-otps.sql.', 500)
    }
    throw error
  }

  return {
    otpId: data.id,
    code,
    expiresAt: data.expires_at,
    target,
    email: String(email).trim().toLowerCase(),
  }
}

export async function consumeOrgResetOtp({ orgId, targetId, requestedBy, code }) {
  assertOrgResetTarget(targetId)
  const trimmed = String(code || '').trim()
  if (!/^\d{6}$/.test(trimmed)) throw httpError('Enter the 6-digit code from your email', 400)

  const { data: row, error } = await supabaseAdmin
    .from('org_data_reset_otps')
    .select('id, code_hash, expires_at, attempts, consumed_at, target_id')
    .eq('org_id', orgId)
    .eq('requested_by', requestedBy)
    .eq('target_id', targetId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      throw httpError('Reset OTP storage is not configured. Apply supabase patch 123-org-data-reset-otps.sql.', 500)
    }
    throw error
  }
  if (!row) throw httpError('No active verification code. Request a new one.', 400)
  if (row.consumed_at) throw httpError('This verification code was already used', 400)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw httpError('Verification code expired. Request a new one.', 400)
  }
  if ((row.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    throw httpError('Too many incorrect attempts. Request a new code.', 400)
  }

  const expected = hashOrgResetOtp(trimmed, orgId)
  if (expected !== row.code_hash) {
    await supabaseAdmin
      .from('org_data_reset_otps')
      .update({ attempts: (row.attempts || 0) + 1 })
      .eq('id', row.id)
    throw httpError('Incorrect verification code', 401)
  }

  const { error: consumeError } = await supabaseAdmin
    .from('org_data_reset_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
  if (consumeError) throw consumeError

  return { otpId: row.id }
}

export const ORG_RESET_OTP = {
  TTL_MS: OTP_TTL_MS,
  RESEND_MS: OTP_RESEND_MS,
  MAX_ATTEMPTS: OTP_MAX_ATTEMPTS,
}
