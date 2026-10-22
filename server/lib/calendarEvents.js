/**
 * Unified calendar events across Tasks, Work Orders, Work Requests, PM plans, Warranties.
 */
import { supabaseAdmin } from '../services/supabase.js'
import { hasModulePermission, getScopedLocationId } from './orgPermissions.js'
import { workOrderDueAt } from './reportConstants.js'

function canRead(session, ...keys) {
  return keys.some((key) => hasModulePermission(session, key, 'read'))
}

function toDateOnly(value) {
  if (!value) return null
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inRange(dateOnly, from, to) {
  if (!dateOnly) return false
  if (from && dateOnly < from) return false
  if (to && dateOnly > to) return false
  return true
}

function normalizePriority(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return null
  if (text.includes('high') || text === 'p1' || text === '1') return 'high'
  if (text.includes('low') || text === 'p3' || text === '3') return 'low'
  if (text.includes('medium') || text.includes('med') || text === 'p2' || text === '2') return 'medium'
  if (text.includes('follow')) return 'followup'
  return null
}

function event({
  source,
  rawId,
  title,
  date,
  plant = null,
  locationId = null,
  priority = null,
  assignedToMe = false,
  meta = {},
}) {
  const dateOnly = toDateOnly(date)
  if (!dateOnly) return null
  const colorKey = source === 'task' && priority === 'followup'
    ? 'followup'
    : source
  return {
    id: `${source}:${rawId}`,
    record_id: rawId,
    source,
    type: source,
    title: title || 'Untitled',
    date: dateOnly,
    plant: plant || '—',
    location_id: locationId || null,
    priority: priority || null,
    colorKey,
    assigned_to_me: Boolean(assignedToMe),
    ...meta,
  }
}

async function safe(label, promise) {
  try {
    return await promise
  } catch (err) {
    console.error(`[calendarEvents:${label}]`, err.message)
    return []
  }
}

async function loadTasks(orgId, profileId, employeeId, { from, to, locationId }) {
  let query = supabaseAdmin
    .from('tasks')
    .select(`
      id, title, due_date, location_id, priority_id, follow_up_remarks,
      location:location_id ( id, name ),
      priority:priority_id ( id, name ),
      task_assignees ( employee_id )
    `)
    .eq('org_id', orgId)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(2000)

  if (from) query = query.gte('due_date', from)
  if (to) query = query.lte('due_date', to)
  if (locationId) query = query.eq('location_id', locationId)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((row) => {
    const assignedIds = (row.task_assignees || []).map((item) => item.employee_id).filter(Boolean)
    const assignedToMe = employeeId ? assignedIds.includes(employeeId) : false
    let priority = normalizePriority(row.priority?.name)
    if (!priority && row.follow_up_remarks) priority = 'followup'
    return event({
      source: 'task',
      rawId: row.id,
      title: row.title,
      date: row.due_date,
      plant: row.location?.name,
      locationId: row.location_id,
      priority: priority || 'medium',
      assignedToMe,
      meta: { status_label: 'Task' },
    })
  }).filter(Boolean)
}

async function loadWorkOrders(orgId, employeeId, { from, to, locationId }) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select(`
      id, wo_number, short_description, priority, status,
      planned_start_at, planned_end_at, scheduled_at,
      assigned_location_id,
      location:assigned_location_id ( id, name )
    `)
    .eq('org_id', orgId)
    .not('status', 'eq', 'cancelled')
    .order('planned_end_at', { ascending: true, nullsFirst: false })
    .limit(2000)

  if (locationId) query = query.eq('assigned_location_id', locationId)

  // Push date window into SQL so we do not pull unrelated months then discard in JS.
  if (from || to) {
    const fromIso = from ? `${from}T00:00:00.000Z` : null
    const toIso = to ? `${to}T23:59:59.999Z` : null
    const clauses = []
    for (const col of ['planned_end_at', 'scheduled_at', 'planned_start_at']) {
      const parts = [`${col}.not.is.null`]
      if (fromIso) parts.push(`${col}.gte.${fromIso}`)
      if (toIso) parts.push(`${col}.lte.${toIso}`)
      clauses.push(`and(${parts.join(',')})`)
    }
    query = query.or(clauses.join(','))
  }

  const { data, error } = await query
  if (error) throw error

  let assigneeMap = new Map()
  if (employeeId && data?.length) {
    const ids = data.map((row) => row.id)
    const { data: links } = await supabaseAdmin
      .from('manual_work_order_assignees')
      .select('work_order_id, employee_id')
      .in('work_order_id', ids)
      .eq('employee_id', employeeId)
    assigneeMap = new Map((links || []).map((row) => [row.work_order_id, true]))
  }

  return (data || []).map((row) => {
    const due = workOrderDueAt(row)
    const dateOnly = toDateOnly(due)
    if (!inRange(dateOnly, from, to)) return null
    const title = row.wo_number
      ? `${row.wo_number}${row.short_description ? ` · ${row.short_description}` : ''}`
      : (row.short_description || 'Work order')
    return event({
      source: 'work_order',
      rawId: row.id,
      title,
      date: dateOnly,
      plant: row.location?.name,
      locationId: row.assigned_location_id,
      priority: normalizePriority(row.priority) || 'medium',
      assignedToMe: Boolean(assigneeMap.get(row.id)),
      meta: { status_label: row.status || 'Work order' },
    })
  }).filter(Boolean)
}

async function loadWorkRequests(orgId, profileId, { from, to, locationId }) {
  let query = supabaseAdmin
    .from('work_requests')
    .select(`
      id, request_number, short_description, priority, status, request_date, requested_by,
      order_to:departments!work_requests_order_to_department_id_fkey ( id, name, location_id ),
      equipment ( id, name, location_id )
    `)
    .eq('org_id', orgId)
    .not('request_date', 'is', null)
    .not('status', 'eq', 'cancelled')
    .order('request_date', { ascending: true })
    .limit(2000)

  if (from) query = query.gte('request_date', `${from}T00:00:00`)
  if (to) query = query.lte('request_date', `${to}T23:59:59`)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((row) => {
    const locId = row.equipment?.location_id || row.order_to?.location_id || null
    if (locationId && locId && locId !== locationId) return null
    if (locationId && !locId) return null
    const title = row.request_number
      ? `${row.request_number}${row.short_description ? ` · ${row.short_description}` : ''}`
      : (row.short_description || 'Work request')
    return event({
      source: 'work_request',
      rawId: row.id,
      title,
      date: row.request_date,
      plant: row.order_to?.name || row.equipment?.name,
      locationId: locId,
      priority: normalizePriority(row.priority) || 'medium',
      assignedToMe: profileId && row.requested_by === profileId,
      meta: { status_label: row.status || 'Work request' },
    })
  }).filter(Boolean)
}

async function loadPmPlans(orgId, { from, to, locationId }) {
  let query = supabaseAdmin
    .from('pm_plans')
    .select(`
      id, name, plan_number, status, next_due_at, location_id,
      location:location_id ( id, name )
    `)
    .eq('org_id', orgId)
    .not('next_due_at', 'is', null)
    .neq('status', 'inactive')
    .order('next_due_at', { ascending: true })
    .limit(2000)

  if (from) query = query.gte('next_due_at', from)
  if (to) query = query.lte('next_due_at', to)
  if (locationId) query = query.eq('location_id', locationId)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((row) => {
    const title = row.plan_number
      ? `${row.plan_number}${row.name ? ` · ${row.name}` : ''}`
      : (row.name || 'PM plan')
    return event({
      source: 'pm_plan',
      rawId: row.id,
      title,
      date: row.next_due_at,
      plant: row.location?.name,
      locationId: row.location_id,
      priority: row.status === 'overdue' ? 'high' : 'medium',
      assignedToMe: false,
      meta: { status_label: row.status || 'PM' },
    })
  }).filter(Boolean)
}

async function loadWarranties(orgId, { from, to }) {
  let query = supabaseAdmin
    .from('warranties')
    .select('id, serial_number, make, warranty_end, warranty_start')
    .eq('org_id', orgId)
    .not('warranty_end', 'is', null)
    .order('warranty_end', { ascending: true })
    .limit(2000)

  if (from) query = query.gte('warranty_end', from)
  if (to) query = query.lte('warranty_end', to)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map((row) => {
    const title = row.serial_number
      ? `Warranty ${row.serial_number}${row.make ? ` · ${row.make}` : ''}`
      : (row.make || 'Warranty expiry')
    return event({
      source: 'warranty',
      rawId: row.id,
      title,
      date: row.warranty_end,
      plant: '—',
      locationId: null,
      priority: 'medium',
      assignedToMe: false,
      meta: { status_label: 'Warranty end' },
    })
  }).filter(Boolean)
}

async function resolveEmployeeId(orgId, profileId) {
  if (!profileId) return null
  const { data } = await supabaseAdmin
    .from('org_employees')
    .select('id')
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return data?.id || null
}

/**
 * @param {{ orgId, session, userProfile, from, to, locationId, sources }}
 */
export async function listCalendarEvents({
  orgId,
  session,
  userProfile,
  from = null,
  to = null,
  locationId = null,
  sources = null,
}) {
  const scopedLocation = getScopedLocationId(session)
  const effectiveLocationId = locationId || scopedLocation || null
  const profileId = userProfile?.id || null
  const employeeId = await resolveEmployeeId(orgId, profileId)

  const wanted = sources?.length
    ? new Set(sources)
    : null

  const include = (key) => !wanted || wanted.has(key)

  const jobs = []

  if (include('task') && canRead(session, 'tasks_followups')) {
    jobs.push(safe('tasks', loadTasks(orgId, profileId, employeeId, {
      from, to, locationId: effectiveLocationId,
    })))
  }
  if (
    include('work_order')
    && canRead(
      session,
      'work_orders',
      'work_orders_manual',
      'work_orders_scheduled',
      'work_orders_received',
      'work_orders_assigned',
    )
  ) {
    jobs.push(safe('work_orders', loadWorkOrders(orgId, employeeId, {
      from, to, locationId: effectiveLocationId,
    })))
  }
  if (
    include('work_request')
    && canRead(
      session,
      'work_request_create',
      'work_request_my',
      'work_request_incoming',
      'work_request_outgoing',
      'work_request_all',
    )
  ) {
    jobs.push(safe('work_requests', loadWorkRequests(orgId, profileId, {
      from, to, locationId: effectiveLocationId,
    })))
  }
  if (
    include('pm_plan')
    && canRead(session, 'work_orders_scheduled', 'work_orders')
  ) {
    jobs.push(safe('pm_plans', loadPmPlans(orgId, {
      from, to, locationId: effectiveLocationId,
    })))
  }
  if (include('warranty') && canRead(session, 'warranty_manager')) {
    jobs.push(safe('warranties', loadWarranties(orgId, { from, to })))
  }

  const batches = await Promise.all(jobs)
  const events = batches.flat().filter(Boolean)
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title)))
  return events
}

export const CALENDAR_SOURCES = [
  { id: 'task', label: 'Tasks' },
  { id: 'work_order', label: 'Work orders' },
  { id: 'work_request', label: 'Work requests' },
  { id: 'pm_plan', label: 'PM schedules' },
  { id: 'warranty', label: 'Warranties' },
]
