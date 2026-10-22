/**
 * Cross-module dashboard KPI aggregation for the org home dashboard.
 */
import { supabaseAdmin } from '../services/supabase.js'
import { hasModulePermission, getScopedLocationId } from './orgPermissions.js'
import { getOrgLimitsSummary } from './orgLimits.js'
import {
  buildDashboardCharts,
  loadDashboardAggregates,
  loadDashboardChartLists,
} from './dashboardCharts.js'

const WR_STATUSES = [
  'draft',
  'submitted',
  'pending_approval',
  'need_info',
  'info_provided',
  'approved',
  'rejected',
  'cancelled',
  'converted',
]

const WO_STATUSES = [
  'draft',
  'assigned',
  'accepted',
  'in_progress',
  'completed',
  'verified',
  'closed',
  'cancelled',
]

const PM_STATUSES = ['active', 'overdue', 'inactive']

function canRead(session, ...keys) {
  return keys.some((key) => hasModulePermission(session, key, 'read'))
}

function kpi(key, label, value, extra = {}) {
  return {
    key,
    label,
    value: Number.isFinite(Number(value)) ? Number(value) : 0,
    ...extra,
  }
}

function statusMapToKpis(map, labels = {}) {
  return Object.entries(map || {}).map(([key, value]) => kpi(
    key,
    labels[key] || String(key).replace(/_/g, ' '),
    value,
  ))
}

function dateBounds(dateFrom, dateTo, column = 'created_at') {
  const gte = {}
  const lte = {}
  if (dateFrom) gte[column] = new Date(dateFrom).toISOString()
  if (dateTo) {
    const day = String(dateTo).slice(0, 10)
    lte[column] = new Date(`${day}T23:59:59.999`).toISOString()
  }
  return {
    active: Boolean(dateFrom || dateTo),
    gte: Object.keys(gte).length ? gte : undefined,
    lte: Object.keys(lte).length ? lte : undefined,
  }
}

async function countRows(table, orgId, { eq = {}, inFilters = {}, locationCol = null, locationId = null, gte, lte } = {}) {
  let query = supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  for (const [col, val] of Object.entries(eq)) {
    if (val == null) continue
    query = query.eq(col, val)
  }
  for (const [col, vals] of Object.entries(inFilters)) {
    if (!vals?.length) continue
    query = query.in(col, vals)
  }
  for (const [col, val] of Object.entries(gte || {})) {
    if (val == null || val === '') continue
    query = query.gte(col, val)
  }
  for (const [col, val] of Object.entries(lte || {})) {
    if (val == null || val === '') continue
    query = query.lte(col, val)
  }
  if (locationId && locationCol) {
    query = query.eq(locationCol, locationId)
  }

  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function countOverdueWorkOrders(orgId, locationId, { gte, lte } = {}) {
  const now = new Date().toISOString()
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .in('status', ['assigned', 'accepted', 'in_progress'])
    .or(`planned_end_at.lt."${now}",scheduled_at.lt."${now}"`)
  if (locationId) query = query.eq('assigned_location_id', locationId)
  if (gte?.created_at) query = query.gte('created_at', gte.created_at)
  if (lte?.created_at) query = query.lte('created_at', lte.created_at)
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

function statusRowsToMap(rows, keyField = 'status') {
  const map = {}
  for (const row of rows || []) {
    const key = row?.[keyField]
    if (key == null || key === '') continue
    map[key] = Number(row.count) || 0
  }
  return map
}

function fillStatusMap(statuses, partial = {}) {
  const map = {}
  for (const status of statuses) map[status] = Number(partial[status]) || 0
  for (const [key, value] of Object.entries(partial)) {
    if (map[key] == null) map[key] = Number(value) || 0
  }
  return map
}

let homeDashboardRpcAvailable = true

async function loadHomeDashboardStatusCounts(orgId, locationId = null) {
  if (!homeDashboardRpcAvailable) return null
  try {
    const { data, error } = await supabaseAdmin.rpc('org_home_dashboard_status_counts', {
      p_org_id: orgId,
      p_location_id: locationId || null,
    })
    if (error) throw error
    if (data && typeof data === 'string') {
      try {
        return JSON.parse(data)
      } catch {
        return null
      }
    }
    return data || null
  } catch (err) {
    const message = String(err?.message || err?.code || '')
    if (/could not find the function|PGRST202|does not exist/i.test(message)) {
      homeDashboardRpcAvailable = false
    }
    console.error('[dashboardSummary] home RPC', err.message)
    return null
  }
}

async function countByStatus(table, orgId, statuses, { statusCol = 'status', locationCol = null, locationId = null, gte, lte } = {}) {
  const entries = await Promise.all(
    statuses.map(async (status) => {
      const n = await countRows(table, orgId, {
        eq: { [statusCol]: status },
        locationCol,
        locationId,
        gte,
        lte,
      })
      return [status, n]
    }),
  )
  return Object.fromEntries(entries)
}

async function safe(promise, fallback = null) {
  try {
    return await promise
  } catch (err) {
    console.error('[dashboardSummary]', err.message)
    return fallback
  }
}

async function resolveAggregates(aggregatePromise) {
  if (!aggregatePromise) return null
  if (typeof aggregatePromise.then === 'function') return aggregatePromise
  return aggregatePromise
}

function calendarWindow(now = new Date()) {
  const end = new Date(now)
  end.setDate(end.getDate() + 13)
  return {
    from: now.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

async function workRequestSection(orgId, session, locationId, aggregatePromise = null, dates = null) {
  if (!canRead(session, 'work_request_create', 'work_request_my', 'work_request_incoming', 'work_request_outgoing', 'work_request_all')) {
    return null
  }
  const aggregates = await resolveAggregates(aggregatePromise)
  // WR location scoping differs by filter; use org-wide counts for dashboard.
  const byStatus = fillStatusMap(
    WR_STATUSES,
    aggregates?.work_requests ? statusRowsToMap(aggregates.work_requests) : {},
  )
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0)
  const open = (byStatus.submitted || 0)
    + (byStatus.pending_approval || 0)
    + (byStatus.need_info || 0)
    + (byStatus.info_provided || 0)
    + (byStatus.approved || 0)

  return {
    id: 'work_requests',
    label: 'Work Requests',
    href: 'work-request/my',
    kpis: [
      kpi('total', 'Total', total),
      kpi('open', 'Open / in flow', open),
      kpi('draft', 'Draft', byStatus.draft),
      kpi('submitted', 'Submitted', byStatus.submitted),
      kpi('pending_approval', 'Pending approval', byStatus.pending_approval),
      kpi('need_info', 'Need info', byStatus.need_info),
      kpi('info_provided', 'Info provided', byStatus.info_provided),
      kpi('approved', 'Approved', byStatus.approved),
      kpi('rejected', 'Rejected', byStatus.rejected),
      kpi('converted', 'Converted', byStatus.converted),
      kpi('cancelled', 'Cancelled', byStatus.cancelled),
    ],
    status_counts: statusMapToKpis(byStatus),
  }
}

async function workOrderSection(orgId, session, locationId, aggregatePromise = null, dates = null) {
  if (!canRead(
    session,
    'work_orders',
    'work_orders_received',
    'work_orders_assigned',
    'work_orders_manual',
    'work_orders_scheduled',
  )) {
    return null
  }

  const aggregates = await resolveAggregates(aggregatePromise)
  const byStatus = fillStatusMap(
    WO_STATUSES,
    aggregates?.work_orders ? statusRowsToMap(aggregates.work_orders) : {},
  )
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0)
  const [manual, scheduled, open, high, medium, low, overdue] = [
    Number(aggregates?.work_orders_manual) || 0,
    Number(aggregates?.work_orders_scheduled) || 0,
    Number(aggregates?.work_orders_open) || 0,
    Number(aggregates?.priorities?.high) || 0,
    Number(aggregates?.priorities?.medium) || 0,
    Number(aggregates?.priorities?.low) || 0,
    Number(aggregates?.overdue) || 0,
  ]

  return {
    id: 'work_orders',
    label: 'Work Orders',
    href: 'work-orders/received',
    kpis: [
      kpi('total', 'Total', total),
      kpi('open', 'Active', open),
      kpi('queue', 'Open', (byStatus.draft || 0) + (byStatus.assigned || 0) + (byStatus.accepted || 0)),
      kpi('draft', 'Draft', byStatus.draft),
      kpi('assigned', 'Assigned', byStatus.assigned),
      kpi('accepted', 'Accepted', byStatus.accepted),
      kpi('in_progress', 'In progress', byStatus.in_progress),
      kpi('completed', 'Completed', byStatus.completed),
      kpi('verified', 'Verified', byStatus.verified),
      kpi('closed', 'Closed', byStatus.closed),
      kpi('cancelled', 'Cancelled', byStatus.cancelled),
      kpi('overdue', 'Overdue', overdue),
      kpi('high', 'High priority', high),
      kpi('medium', 'Medium priority', medium),
      kpi('low', 'Low priority', low),
      kpi('manual', 'Manual', manual),
      kpi('scheduled', 'From PM', scheduled),
    ],
    status_counts: statusMapToKpis(byStatus),
  }
}

async function pmSection(orgId, session, locationId, aggregatePromise = null, dates = null) {
  if (!canRead(session, 'work_orders_scheduled')) {
    return null
  }
  const aggregates = await resolveAggregates(aggregatePromise)
  const byStatus = fillStatusMap(
    PM_STATUSES,
    aggregates?.pm_plans ? statusRowsToMap(aggregates.pm_plans) : {},
  )
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0)

  return {
    id: 'pm',
    label: 'PM Schedule',
    href: 'work-orders/scheduled',
    kpis: [
      kpi('total', 'Total plans', total),
      kpi('active', 'Active', byStatus.active),
      kpi('overdue', 'Overdue', byStatus.overdue),
      kpi('inactive', 'Inactive', byStatus.inactive),
    ],
    status_counts: statusMapToKpis(byStatus),
  }
}

async function tasksSection(orgId, session, aggregatePromise = null, dates = null) {
  if (!canRead(session, 'tasks_followups')) return null

  const [aggregates, statusResult] = await Promise.all([
    resolveAggregates(aggregatePromise),
    supabaseAdmin
      .from('task_statuses')
      .select('id, name, is_terminal, sort_order')
      .eq('org_id', orgId)
      .order('sort_order'),
  ])
  const { data: statuses, error: statusError } = statusResult
  if (statusError) throw statusError

  const statusRows = statuses || []
  const taskCountMap = aggregates?.tasks
    ? statusRowsToMap(aggregates.tasks, 'status_id')
    : null
  const counts = statusRows.map((row) => ({
    key: row.id,
    label: row.name,
    value: Number(taskCountMap?.[row.id]) || 0,
    is_done: Boolean(row.is_terminal),
  }))
  const total = counts.reduce((sum, row) => sum + row.value, 0)
  const open = counts.filter((row) => !row.is_done).reduce((sum, row) => sum + row.value, 0)
  const done = counts.filter((row) => row.is_done).reduce((sum, row) => sum + row.value, 0)

  let upcomingReminders = 0
  try {
    const now = new Date().toISOString()
    const { count } = await supabaseAdmin
      .from('task_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('remind_at', now)
    upcomingReminders = count || 0
  } catch {
    upcomingReminders = 0
  }

  return {
    id: 'tasks',
    label: 'Tasks & Follow-ups',
    href: 'tasks-and-followups',
    kpis: [
      kpi('total', 'Total tasks', total),
      kpi('open', 'Open', open),
      kpi('done', 'Done', done),
      kpi('reminders', 'Upcoming reminders', upcomingReminders),
      ...counts.map((row) => kpi(row.key, row.label, row.value)),
    ],
    status_counts: counts.map((row) => kpi(row.key, row.label, row.value)),
  }
}

function warrantyBucket(row, now = new Date()) {
  if (!row?.warranty_end) return 'active'
  const end = new Date(`${String(row.warranty_end).slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return 'active'
  if (end < now) return 'expired'
  const notifyDays = Number(row.expiry_notification_days)
  const windowDays = Number.isFinite(notifyDays) && notifyDays >= 0 ? notifyDays : 30
  const soon = new Date(now)
  soon.setDate(soon.getDate() + windowDays)
  if (end <= soon) return 'expiring_soon'
  return 'active'
}

async function countWarrantyStatusesLite(orgId) {
  const totals = { active: 0, expiring_soon: 0, expired: 0 }
  const now = new Date()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('warranties')
      .select('warranty_end, expiry_notification_days')
      .eq('org_id', orgId)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      const key = warrantyBucket(row, now)
      totals[key] += 1
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from >= 100000) break
  }
  return totals
}

function warrantyModule(normalized) {
  const counts = {
    active: Number(normalized?.active) || 0,
    expiring_soon: Number(normalized?.expiring_soon) || 0,
    expired: Number(normalized?.expired) || 0,
  }
  const present = Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0))
  return {
    id: 'warranties',
    label: 'Warranty Manager',
    href: 'warranty-manager',
    kpis: [
      kpi('total', 'Total', counts.active + counts.expiring_soon + counts.expired),
      kpi('active', 'Active', counts.active),
      kpi('expiring_soon', 'Expiring soon', counts.expiring_soon),
      kpi('expired', 'Expired', counts.expired),
    ],
    status_counts: statusMapToKpis(present),
  }
}

async function warrantySection(orgId, session, aggregatePromise = null) {
  if (!canRead(session, 'warranty_manager')) return null
  const aggregates = await resolveAggregates(aggregatePromise)
  const normalized = aggregates?.warranties?.by_status
    ? aggregates.warranties.by_status
    : await countWarrantyStatusesLite(orgId)
  return warrantyModule(normalized)
}

async function assetsSection(orgId, session, locationId) {
  if (!canRead(session, 'equipment', 'assets', 'areas')) return null

  const [equipment, areas, fields] = await Promise.all([
    canRead(session, 'equipment')
      ? countRows('equipment', orgId, { locationCol: 'location_id', locationId })
      : Promise.resolve(null),
    canRead(session, 'areas')
      ? countRows('areas', orgId, { locationCol: 'location_id', locationId })
      : Promise.resolve(null),
    canRead(session, 'assets')
      ? countRows('asset_fields', orgId).catch(() => 0)
      : Promise.resolve(null),
  ])

  const kpis = []
  if (equipment != null) kpis.push(kpi('equipment', 'Equipment', equipment))
  if (areas != null) kpis.push(kpi('areas', 'Areas', areas))
  if (fields != null) kpis.push(kpi('fields', 'Asset fields', fields))
  if (!kpis.length) return null

  return {
    id: 'assets',
    label: 'Assets & Equipment',
    href: 'masters/equipment',
    kpis,
  }
}

async function vendorsSection(orgId, session) {
  if (!canRead(session, 'vendors')) return null
  const total = await countRows('vendors', orgId)
  return {
    id: 'vendors',
    label: 'Vendors',
    href: 'masters/vendors',
    kpis: [kpi('total', 'Total vendors', total)],
  }
}

async function companySection(orgId, session) {
  if (!canRead(session, 'company', 'locations', 'departments', 'employees', 'work_centers')) {
    return null
  }

  const [summary, workCenters] = await Promise.all([
    getOrgLimitsSummary(orgId),
    canRead(session, 'work_centers', 'company')
      ? countRows('work_centers', orgId).catch(() => 0)
      : Promise.resolve(0),
  ])

  const usage = summary.usage || {}
  const limits = summary.limits || {}

  return {
    id: 'company',
    label: 'Company masters',
    href: 'masters/company',
    kpis: [
      kpi('locations', 'Locations', usage.locations, { limit: limits.location_limit }),
      kpi('departments', 'Departments', usage.departments, { limit: limits.department_limit }),
      kpi('employees', 'Employees', usage.employees, { limit: limits.employee_limit }),
      kpi('logins', 'Logins', usage.logins, { limit: limits.login_limit }),
      kpi('work_centers', 'Work centers', workCenters),
    ],
    limits,
    usage,
  }
}

async function notificationsSection(orgId, authUserId) {
  if (!authUserId) return null
  try {
    let query = supabaseAdmin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', authUserId)
      .is('read_at', null)
    if (orgId) query = query.eq('org_id', orgId)
    const { count, error } = await query
    if (error) throw error
    return {
      id: 'notifications',
      label: 'Notifications',
      href: null,
      kpis: [kpi('unread', 'Unread', count || 0)],
    }
  } catch {
    return {
      id: 'notifications',
      label: 'Notifications',
      href: null,
      kpis: [kpi('unread', 'Unread', 0)],
    }
  }
}

const CALENDAR_LABELS = {
  task: 'Tasks',
  work_order: 'Work orders',
  work_request: 'Work requests',
  pm_plan: 'PM schedules',
  warranty: 'Warranties',
}

function calendarModule(counts) {
  const ordered = ['task', 'work_order', 'work_request', 'pm_plan', 'warranty']
  const status_counts = ordered
    .filter((key) => (Number(counts?.[key]) || 0) > 0)
    .map((key) => kpi(key, CALENDAR_LABELS[key] || key, counts[key]))
  const total = status_counts.reduce((sum, row) => sum + row.value, 0)
  return {
    id: 'calendar',
    label: 'Calendar',
    href: 'calendar',
    kpis: [
      kpi('upcoming', 'Next 14 days', total),
      ...status_counts,
    ],
    status_counts,
  }
}

async function calendarSection(orgId, session, locationId, aggregatePromise = null, calendar = null) {
  if (!canRead(session, 'calendar')) return null
  const window = calendar || calendarWindow()
  const aggregates = await resolveAggregates(aggregatePromise)
  const raw = aggregates?.calendar || {}
  const visible = {}
  if (canRead(session, 'tasks_followups')) visible.task = Number(raw?.task) || 0
  if (canRead(session, 'work_orders', 'work_orders_manual', 'work_orders_scheduled', 'work_orders_received', 'work_orders_assigned')) {
    visible.work_order = Number(raw?.work_order) || 0
  }
  if (canRead(session, 'work_request_create', 'work_request_my', 'work_request_incoming', 'work_request_outgoing', 'work_request_all')) {
    visible.work_request = Number(raw?.work_request) || 0
  }
  if (canRead(session, 'work_orders_scheduled', 'work_orders')) visible.pm_plan = Number(raw?.pm_plan) || 0
  if (canRead(session, 'warranty_manager')) visible.warranty = Number(raw?.warranty) || 0
  return calendarModule(visible)
}

async function othersSection(orgId, session) {
  const canOthers = canRead(session, 'others')
  const canSettings = canRead(session, 'settings')
  if (!canOthers && !canSettings) return null

  const [checklists, statuses, limits] = await Promise.all([
    canOthers ? countRows('checklist_templates', orgId).catch(() => 0) : Promise.resolve(null),
    canOthers ? countRows('org_statuses', orgId).catch(() => 0) : Promise.resolve(null),
    (canOthers || canSettings) ? countRows('org_text_field_limits', orgId).catch(() => 0) : Promise.resolve(null),
  ])

  const kpis = []
  if (checklists != null) kpis.push(kpi('checklists', 'Checklists', checklists))
  if (statuses != null) kpis.push(kpi('statuses', 'Statuses', statuses))
  if (limits != null) kpis.push(kpi('limits', 'Character limits', limits))
  if (!kpis.length) return null

  return {
    id: 'others',
    label: 'Others',
    href: canOthers ? 'masters/others/status' : 'masters/others/character-limits',
    kpis,
  }
}

async function rolesSection(orgId, session) {
  if (!canRead(session, 'roles_access')) return null
  const total = await countRows('org_access_roles', orgId).catch(() => 0)
  return {
    id: 'roles',
    label: 'Roles & Access',
    href: 'configuration/roles',
    kpis: [kpi('total', 'Roles', total)],
  }
}

function reportsSection(session, workOrders) {
  if (!canRead(
    session,
    'reports',
    'reports_daily_logs',
    'reports_plant_wise',
    'reports_open_logs',
    'reports_completed_logs',
    'reports_overdue',
  )) {
    return null
  }
  const value = (key) => Number(workOrders?.kpis?.find((item) => item.key === key)?.value) || 0
  return {
    id: 'reports',
    label: 'Reports',
    href: 'reports',
    kpis: [
      kpi('open', 'Open logs', value('open')),
      kpi('in_progress', 'In progress', value('in_progress')),
      kpi('completed', 'Completed logs', value('completed')),
      kpi('verified', 'Verified', value('verified')),
      kpi('overdue', 'Overdue', value('overdue')),
    ],
  }
}

async function loadLocations(orgId, locationId) {
  let query = supabaseAdmin
    .from('org_locations')
    .select('id, name, is_active')
    .eq('org_id', orgId)
    .order('name')
  if (locationId) query = query.eq('id', locationId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).filter((row) => row.is_active !== false).map(({ id, name }) => ({ id, name }))
}

/**
 * @param {object} args
 * @param {string} args.orgId
 * @param {object} args.session - req.orgPermissions
 * @param {object} args.userProfile
 * @param {string|null} args.locationId - optional filter (already scoped)
 */
export async function buildDashboardSummary({
  orgId,
  session,
  userProfile,
  authUserId = null,
  locationId = null,
  dateFrom = null,
  dateTo = null,
}) {
  const scoped = getScopedLocationId(session)
  const effectiveLocationId = scoped || (locationId && locationId !== 'all' ? locationId : null)
  const createdDates = dateBounds(dateFrom, dateTo, 'created_at')
  const pmDates = dateBounds(dateFrom, dateTo, 'next_due_at')
  const calendar = calendarWindow()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const aggregatePromise = loadDashboardAggregates({
    orgId,
    locationId: effectiveLocationId,
    dateFrom,
    dateTo,
    createdFrom: createdDates.gte?.created_at || null,
    createdTo: createdDates.lte?.created_at || null,
    pmFrom: pmDates.gte?.next_due_at || null,
    pmTo: pmDates.lte?.next_due_at || null,
    calendarFrom: calendar.from,
    calendarTo: calendar.to,
    timeZone,
  }).then(async (chart) => {
    if (chart) return chart
    if (createdDates.active) return null
    return loadHomeDashboardStatusCounts(orgId, effectiveLocationId)
  })
  const listsPromise = loadDashboardChartLists({
    orgId,
    locationId: effectiveLocationId,
    dateFrom,
    dateTo,
    include: {
      workOrders: canRead(
        session,
        'work_orders',
        'work_orders_received',
        'work_orders_assigned',
        'work_orders_manual',
        'work_orders_scheduled',
      ),
      workRequests: canRead(
        session,
        'work_request_create',
        'work_request_my',
        'work_request_incoming',
        'work_request_outgoing',
        'work_request_all',
      ),
      pm: canRead(session, 'work_orders_scheduled'),
      tasks: canRead(session, 'tasks_followups'),
      warranties: canRead(session, 'warranty_manager'),
    },
  })

  const [
    locations,
    work_requests,
    work_orders,
    pm,
    tasks,
    warranties,
    assets,
    vendors,
    company,
    notifications,
    calendarModuleResult,
    others,
    roles,
    lists,
  ] = await Promise.all([
    safe(loadLocations(orgId, scoped), []),
    safe(workRequestSection(orgId, session, effectiveLocationId, aggregatePromise, createdDates), null),
    safe(workOrderSection(orgId, session, effectiveLocationId, aggregatePromise, createdDates), null),
    safe(pmSection(orgId, session, effectiveLocationId, aggregatePromise, pmDates), null),
    safe(tasksSection(orgId, session, aggregatePromise, createdDates), null),
    safe(warrantySection(orgId, session, aggregatePromise), null),
    safe(assetsSection(orgId, session, effectiveLocationId), null),
    safe(vendorsSection(orgId, session), null),
    safe(companySection(orgId, session), null),
    safe(notificationsSection(orgId, authUserId || userProfile?.user_id), null),
    safe(calendarSection(orgId, session, effectiveLocationId, aggregatePromise, calendar), null),
    safe(othersSection(orgId, session), null),
    safe(rolesSection(orgId, session), null),
    safe(listsPromise, null),
  ])

  const reports = reportsSection(session, work_orders)

  const modules = [
    work_requests,
    work_orders,
    pm,
    tasks,
    warranties,
    calendarModuleResult,
    reports,
    assets,
    vendors,
    company,
    others,
    roles,
    notifications,
  ].filter(Boolean)

  const aggregates = await aggregatePromise
  const charts = await safe(buildDashboardCharts({
    orgId,
    locationId: effectiveLocationId,
    locations,
    modules,
    dateFrom,
    dateTo,
    aggregates,
    lists,
  }), { kpis: [], donuts: [], trends: [], locations: [], recent_work_orders: [], upcoming_pm: [], upcoming_tasks: [], expiring_warranties: [], range_label: 'Last 14 days' })

  const overview = charts?.kpis?.length
    ? charts.kpis
    : modules.flatMap((mod) => (mod.kpis || []).map((item) => (
      kpi(`${mod.id}.${item.key}`, item.label, item.value, { module: mod.id, limit: item.limit })
    )))

  return {
    generated_at: new Date().toISOString(),
    scoped_location_id: scoped,
    location_id: effectiveLocationId,
    locations,
    overview,
    modules,
    charts,
  }
}
