import { supabaseAdmin } from '../services/supabase.js'
import { loadTimelineActors } from './timelineActors.js'
import { formatCalendarDate } from './displayDate.js'

function prettyLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim()
}

function pushDetail(rows, label, value) {
  const text = value == null ? '' : String(value).trim()
  if (!text) return
  rows.push({ label, value: text })
}

function normalizeExplicitDetails(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => ({
      label: String(row?.label || '').trim(),
      value: row?.value == null ? '' : String(row.value).trim(),
    }))
    .filter((row) => row.label && row.value)
}

async function departmentNames(orgId, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (!orgId || !unique.length) return new Map()
  const { data } = await supabaseAdmin
    .from('departments')
    .select('id, name')
    .eq('org_id', orgId)
    .in('id', unique)
  return new Map((data || []).map((row) => [row.id, row.name]))
}

async function personName(orgId, profileId) {
  if (!orgId || !profileId) return null
  const actors = await loadTimelineActors(orgId, [profileId])
  return actors.get(profileId)?.name || null
}

async function assigneeNames(orgId, workOrderId) {
  if (!orgId || !workOrderId) return null
  const { data: links } = await supabaseAdmin
    .from('manual_work_order_assignees')
    .select('employee_id')
    .eq('org_id', orgId)
    .eq('work_order_id', workOrderId)
  const employeeIds = [...new Set((links || []).map((row) => row.employee_id).filter(Boolean))]
  if (!employeeIds.length) return null
  const { data: employees } = await supabaseAdmin
    .from('org_employees')
    .select('name')
    .eq('org_id', orgId)
    .in('id', employeeIds)
  const names = (employees || []).map((row) => row.name).filter(Boolean)
  return names.length ? names.join(', ') : null
}

async function equipmentLabel(orgId, equipmentId) {
  if (!orgId || !equipmentId) return null
  const { data } = await supabaseAdmin
    .from('equipment')
    .select('name, code')
    .eq('org_id', orgId)
    .eq('id', equipmentId)
    .maybeSingle()
  if (!data) return null
  return [data.name, data.code].filter(Boolean).join(' · ')
}

function clipDetail(value, max = 280) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3)}…` : text
}

async function loadWorkRequestDetails(orgId, workRequestId) {
  if (!orgId || !workRequestId) return []
  const { data: wr } = await supabaseAdmin
    .from('work_requests')
    .select(`
      id, request_number, status, request_type, short_description, problem_description,
      priority, job_nature, requested_by, order_from_department_id, order_to_department_id,
      equipment_id
    `)
    .eq('org_id', orgId)
    .eq('id', workRequestId)
    .maybeSingle()
  if (!wr) return []

  const [deptMap, createdBy, asset] = await Promise.all([
    departmentNames(orgId, [wr.order_from_department_id, wr.order_to_department_id]),
    personName(orgId, wr.requested_by),
    equipmentLabel(orgId, wr.equipment_id),
  ])

  const rows = []
  pushDetail(rows, 'Request', wr.request_number)
  pushDetail(rows, 'Short description', wr.short_description)
  pushDetail(rows, 'Status', prettyLabel(wr.status))
  pushDetail(rows, 'Created by', createdBy)
  pushDetail(rows, 'Request type', prettyLabel(wr.request_type))
  pushDetail(rows, 'Order from', deptMap.get(wr.order_from_department_id))
  pushDetail(rows, 'Order to', deptMap.get(wr.order_to_department_id))
  pushDetail(rows, 'Asset', asset)
  pushDetail(rows, 'Priority', prettyLabel(wr.priority))
  pushDetail(rows, 'Job nature', prettyLabel(wr.job_nature))
  if (wr.problem_description && wr.problem_description !== wr.short_description) {
    pushDetail(rows, 'Detailed description', clipDetail(wr.problem_description))
  }
  return rows
}

async function loadWorkOrderDetails(orgId, workOrderId) {
  if (!orgId || !workOrderId) return []
  const { data: order } = await supabaseAdmin
    .from('manual_work_orders')
    .select(`
      id, wo_number, status, source_type, short_description, problem_description, priority,
      work_center, created_by, requester_id, work_request_id, equipment_id,
      assigned_department_id
    `)
    .eq('org_id', orgId)
    .eq('id', workOrderId)
    .maybeSingle()
  if (!order) return []

  const [createdBy, requester, assignees, asset, deptMap, wrDetails] = await Promise.all([
    personName(orgId, order.created_by),
    personName(orgId, order.requester_id),
    assigneeNames(orgId, order.id),
    equipmentLabel(orgId, order.equipment_id),
    departmentNames(orgId, [order.assigned_department_id]),
    order.work_request_id ? loadWorkRequestDetails(orgId, order.work_request_id) : Promise.resolve([]),
  ])

  const rows = []
  pushDetail(rows, 'Work order', order.wo_number)
  pushDetail(rows, 'Short description', order.short_description)
  pushDetail(rows, 'Status', prettyLabel(order.status))
  pushDetail(rows, 'Source', prettyLabel(order.source_type))
  pushDetail(rows, 'Created by', createdBy)
  if (requester && requester !== createdBy) pushDetail(rows, 'Requester', requester)
  pushDetail(rows, 'Assignees', assignees)
  pushDetail(rows, 'Department', deptMap.get(order.assigned_department_id))
  pushDetail(rows, 'Work center', order.work_center)
  pushDetail(rows, 'Asset', asset)
  pushDetail(rows, 'Priority', prettyLabel(order.priority))
  if (order.problem_description && order.problem_description !== order.short_description) {
    pushDetail(rows, 'Detailed description', clipDetail(order.problem_description))
  }

  const wrLabels = new Set(rows.map((row) => row.label))
  for (const row of wrDetails) {
    const allow = ['Request', 'Order from', 'Order to', 'Request type', 'Short description']
    if (allow.includes(row.label) && !wrLabels.has(row.label)) {
      rows.push(row)
      wrLabels.add(row.label)
    }
  }
  return rows
}

/** Short description from detail rows (for email subjects). */
export function shortDescriptionFromDetails(details = []) {
  const row = (details || []).find((item) => /^short description$/i.test(String(item?.label || '')))
  const text = row?.value == null ? '' : String(row.value).trim()
  return text || ''
}

/** Build `Title — short description` without duplicating or overflowing the subject. */
export function notificationEmailSubject(title, details = [], { maxShort = 80 } = {}) {
  const sep = ' — '
  const base = String(title || 'MMS PRO notification').trim() || 'MMS PRO notification'
  const short = shortDescriptionFromDetails(details)
  if (!short) return base
  const clipped = short.length > maxShort ? `${short.slice(0, Math.max(0, maxShort - 1))}…` : short
  const lowerBase = base.toLowerCase()
  const lowerClipped = clipped.toLowerCase()
  if (lowerBase.includes(lowerClipped)) return base

  const idx = base.lastIndexOf(sep)
  if (idx !== -1) {
    const head = base.slice(0, idx)
    const tail = base.slice(idx + sep.length).trim()
    const lowerTail = tail.toLowerCase()
    if (
      tail
      && (lowerClipped.startsWith(lowerTail) || lowerTail.startsWith(lowerClipped.slice(0, Math.min(24, lowerClipped.length))))
    ) {
      return `${head}${sep}${clipped}`
    }
  }
  return `${base}${sep}${clipped}`
}

async function loadTaskDetails(orgId, taskId) {
  if (!orgId || !taskId) return []
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, task_number, title, short_description, due_date, start_date, created_by, status_id, priority_id')
    .eq('org_id', orgId)
    .eq('id', taskId)
    .maybeSingle()
  if (!task) return []

  const [createdBy, statusRow, priorityRow] = await Promise.all([
    personName(orgId, task.created_by),
    task.status_id
      ? supabaseAdmin.from('task_statuses').select('name').eq('org_id', orgId).eq('id', task.status_id).maybeSingle()
      : Promise.resolve({ data: null }),
    task.priority_id
      ? supabaseAdmin.from('task_priorities').select('name').eq('org_id', orgId).eq('id', task.priority_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rows = []
  pushDetail(rows, 'Task', task.task_number)
  pushDetail(rows, 'Title', task.title)
  pushDetail(rows, 'Status', statusRow?.data?.name)
  pushDetail(rows, 'Priority', priorityRow?.data?.name)
  pushDetail(rows, 'Created by', createdBy)
  pushDetail(rows, 'Start', formatCalendarDate(task.start_date))
  pushDetail(rows, 'Due', formatCalendarDate(task.due_date))
  pushDetail(rows, 'Short description', task.short_description)
  return rows
}

async function loadPmPlanDetails(orgId, planId) {
  if (!orgId || !planId) return []
  const { data: plan } = await supabaseAdmin
    .from('pm_plans')
    .select('id, plan_number, name, status, frequency, next_due_at, created_by, equipment_id, location_id')
    .eq('org_id', orgId)
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return []

  const [createdBy, asset] = await Promise.all([
    personName(orgId, plan.created_by),
    equipmentLabel(orgId, plan.equipment_id),
  ])
  const rows = []
  pushDetail(rows, 'PM plan', plan.plan_number)
  pushDetail(rows, 'Name', plan.name)
  pushDetail(rows, 'Status', prettyLabel(plan.status))
  pushDetail(rows, 'Created by', createdBy)
  pushDetail(rows, 'Frequency', prettyLabel(plan.frequency))
  pushDetail(rows, 'Next due', formatCalendarDate(plan.next_due_at))
  pushDetail(rows, 'Asset', asset)
  return rows
}

/**
 * Build structured detail rows for activity notification emails.
 * Prefer explicit data.details when provided; otherwise load from the linked record.
 */
export async function buildNotificationEmailDetails(orgId, data = {}) {
  const explicit = normalizeExplicitDetails(data.details)
  if (explicit.length) return explicit

  if (data.work_order_id) {
    return loadWorkOrderDetails(orgId, data.work_order_id)
  }
  if (data.work_request_id) {
    return loadWorkRequestDetails(orgId, data.work_request_id)
  }
  if (data.task_id) {
    return loadTaskDetails(orgId, data.task_id)
  }
  if (data.pm_plan_id) {
    return loadPmPlanDetails(orgId, data.pm_plan_id)
  }

  const fallback = []
  pushDetail(fallback, 'Status', prettyLabel(data.status))
  return fallback
}
