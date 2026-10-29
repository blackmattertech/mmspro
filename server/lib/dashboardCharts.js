/**
 * Chart-ready dashboard payload: headline KPIs, status mixes, and short trends.
 */
import { supabaseAdmin } from '../services/supabase.js'

const PALETTE = ['#E63946', '#FFB020', '#3B82F6', '#22C55E', '#8B5CF6', '#14B8A6', '#F97316', '#64748B']

const TONES = {
  red: '#E63946',
  yellow: '#FFB020',
  blue: '#3B82F6',
  green: '#22C55E',
  purple: '#8B5CF6',
}

function moduleById(modules, id) {
  return (modules || []).find((mod) => mod.id === id) || null
}

function kpiMeta(mod, key) {
  return mod?.kpis?.find((row) => row.key === key) || null
}

function kpiValue(mod, key) {
  const item = kpiMeta(mod, key)
  if (!item) return null
  const n = Number(item.value)
  return Number.isFinite(n) ? n : 0
}

function statusValue(mod, key) {
  const row = mod?.status_counts?.find((item) => item.key === key)
  if (row) {
    const n = Number(row.value)
    return Number.isFinite(n) ? n : 0
  }
  const fromKpi = kpiValue(mod, key)
  return fromKpi == null ? 0 : fromKpi
}

function sumValues(mod, keys) {
  if (!mod) return null
  let total = 0
  let found = false
  for (const key of keys) {
    const value = kpiValue(mod, key)
    if (value == null) continue
    found = true
    total += value
  }
  return found ? total : null
}

function rel(value) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function utcToday() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

function eachDay(from, to) {
  const days = []
  for (let cursor = new Date(from); cursor <= to; cursor = addDays(cursor, 1)) {
    days.push(isoDay(cursor))
  }
  return days
}

function dayLabel(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function resolveWindow(dateFrom, dateTo) {
  const today = utcToday()
  if (dateFrom || dateTo) {
    const end = dateTo ? new Date(`${String(dateTo).slice(0, 10)}T00:00:00Z`) : today
    let start = dateFrom ? new Date(`${String(dateFrom).slice(0, 10)}T00:00:00Z`) : addDays(end, -13)
    if (Number.isNaN(start.getTime())) start = addDays(end, -13)
    if (Number.isNaN(end.getTime())) return resolveWindow(null, null)
    if (start > end) start = end
    if (Math.round((end - start) / 86400000) > 30) start = addDays(end, -30)
    const days = eachDay(start, end)
    return {
      since: start.toISOString(),
      until: new Date(`${isoDay(end)}T23:59:59.999Z`).toISOString(),
      days,
      priorDays: [],
      compare: false,
      label: days.length ? `${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}` : 'Selected dates',
    }
  }
  const end = today
  const start = addDays(end, -59)
  const all = eachDay(start, end)
  return {
    since: start.toISOString(),
    until: new Date(`${isoDay(end)}T23:59:59.999Z`).toISOString(),
    days: all.slice(30),
    priorDays: all.slice(0, 30),
    compare: true,
    label: 'Last 30 days',
  }
}

function trendPercent(current, previous) {
  if (!previous) return current > 0 ? 100 : 0
  const raw = Math.round(((current - previous) / previous) * 1000) / 10
  return Number.isFinite(raw) ? raw : 0
}

function countsByDay(rows, dayKeys, match, dateField = 'created_at') {
  const allowed = new Set(dayKeys)
  const map = Object.fromEntries(dayKeys.map((day) => [day, 0]))
  for (const row of rows || []) {
    if (match && !match(row)) continue
    const raw = row?.[dateField]
    if (!raw) continue
    const day = String(raw).slice(0, 10)
    if (!allowed.has(day)) continue
    map[day] += 1
  }
  return dayKeys.map((day) => map[day])
}

function isOverdueWorkOrder(row, nowMs) {
  if (!['assigned', 'accepted', 'in_progress'].includes(row?.status)) return false
  const due = row.planned_end_at || row.scheduled_at
  if (!due) return false
  const time = new Date(due).getTime()
  return Number.isFinite(time) && time < nowMs
}

async function loadRows(table, columns, orgId, { locationCol, locationId, since, until } = {}) {
  let query = supabaseAdmin.from(table).select(columns).eq('org_id', orgId).limit(5000)
  if (locationId && locationCol) query = query.eq(locationCol, locationId)
  if (since) query = query.gte('created_at', since)
  if (until) query = query.lte('created_at', until)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function loadSafe(factory, fallback) {
  try {
    return await factory()
  } catch (err) {
    console.error('[dashboardCharts]', err.message)
    return fallback
  }
}

function donut(id, title, parts) {
  const segments = (parts || []).filter((part) => part && (part.count > 0 || part.includeZero))
  if (!segments.length) return null
  const total = segments.reduce((sum, part) => sum + (Number(part.count) || 0), 0)
  return {
    id,
    title,
    total,
    segments: segments.map((part) => ({
      status: part.key,
      label: part.label,
      color: part.color,
      count: Number(part.count) || 0,
      percent: total ? Math.round(((Number(part.count) || 0) / total) * 1000) / 10 : 0,
    })),
  }
}

function donutFromCounts(id, title, counts) {
  const parts = (counts || [])
    .filter((row) => Number(row.value) > 0)
    .slice(0, 8)
    .map((row, index) => ({
      key: String(row.key),
      label: row.label,
      count: Number(row.value) || 0,
      color: PALETTE[index % PALETTE.length],
    }))
  if (!parts.length) return null
  return donut(id, title, parts)
}

function seriesFromDaily(daily, dayKeys, field) {
  const map = new Map((daily || []).map((row) => [String(row.day).slice(0, 10), Number(row[field]) || 0]))
  return (dayKeys || []).map((day) => map.get(day) || 0)
}

function trendBlockFromDaily(id, title, daily, series, days) {
  if (!days?.length) return null
  const byDay = new Map((daily || []).map((row) => [String(row.day).slice(0, 10), row]))
  const points = days.map((day) => {
    const row = byDay.get(day) || {}
    const values = {}
    for (const item of series) values[item.key] = Number(row[item.field]) || 0
    return { date: dayLabel(day), values }
  })
  return {
    id,
    title,
    series: series.map(({ key, label, color }) => ({ key, label, color })),
    points,
  }
}

function trendBlock(id, title, rows, series, days) {
  if (!days?.length) return null
  const points = days.map((day) => {
    const values = {}
    for (const item of series) values[item.key] = 0
    return { day, date: dayLabel(day), values }
  })
  const index = new Map(points.map((point, i) => [point.day, i]))
  for (const row of rows || []) {
    const day = row?.created_at ? String(row.created_at).slice(0, 10) : null
    if (!day || !index.has(day)) continue
    const point = points[index.get(day)]
    for (const item of series) {
      if (item.match(row)) point.values[item.key] += 1
    }
  }
  return {
    id,
    title,
    series: series.map(({ key, label, color }) => ({ key, label, color })),
    points: points.map(({ date, values }) => ({ date, values })),
  }
}

function activityCard({
  key, label, value, tone, inverse = false, rows, match, daily, field, window, limit, module,
}) {
  if (value == null) return null
  const useDaily = Array.isArray(daily) && field
  const spark = useDaily
    ? seriesFromDaily(daily, window.days, field)
    : (rows ? countsByDay(rows, window.days, match) : [])
  const prior = window.compare
    ? (useDaily
      ? seriesFromDaily(daily, window.priorDays, field)
      : (rows ? countsByDay(rows, window.priorDays, match) : []))
    : []
  const card = {
    key,
    label,
    value,
    tone,
    module,
    limit: limit ?? undefined,
    trendInverse: inverse,
    sparkline: spark,
    trendPercent: null,
  }
  if (window.compare && spark.length) {
    const current = spark.reduce((sum, n) => sum + n, 0)
    const previous = prior.reduce((sum, n) => sum + n, 0)
    card.trendPercent = trendPercent(current, previous)
  }
  return card
}

function staticCard({ key, label, value, tone, module, limit, inverse = false }) {
  if (value == null) return null
  return {
    key,
    label,
    value,
    tone,
    module,
    limit: limit ?? undefined,
    trendInverse: inverse,
    sparkline: [],
    trendPercent: null,
  }
}

function buildHeadlines({ modules, window, woRows, wrRows, pmRows, taskRows, daily = null, nowMs }) {
  const wo = moduleById(modules, 'work_orders')
  const wr = moduleById(modules, 'work_requests')
  const pm = moduleById(modules, 'pm')
  const tasks = moduleById(modules, 'tasks')
  const warranties = moduleById(modules, 'warranties')
  const assets = moduleById(modules, 'assets')
  const vendors = moduleById(modules, 'vendors')
  const company = moduleById(modules, 'company')
  const calendar = moduleById(modules, 'calendar')
  const others = moduleById(modules, 'others')
  const roles = moduleById(modules, 'roles')
  const notifications = moduleById(modules, 'notifications')
  const cards = []

  const addActivity = (spec) => {
    const bucket = spec.bucket && daily ? (daily[spec.bucket] || []) : null
    const card = activityCard({ ...spec, window, daily: bucket })
    if (card) cards.push(card)
  }
  const addStatic = (spec) => {
    const card = staticCard(spec)
    if (card) cards.push(card)
  }

  addActivity({
    key: 'work_orders.total',
    module: 'work_orders',
    label: 'Total work orders',
    value: kpiValue(wo, 'total'),
    tone: 'red',
    rows: woRows,
    bucket: 'work_orders',
    field: 'total',
    match: () => true,
  })
  addActivity({
    key: 'work_orders.queue',
    module: 'work_orders',
    label: 'Open',
    value: kpiValue(wo, 'queue'),
    tone: 'red',
    rows: woRows,
    bucket: 'work_orders',
    field: 'open',
    match: (row) => ['draft', 'assigned', 'accepted'].includes(row.status),
  })
  addActivity({
    key: 'work_orders.in_progress',
    module: 'work_orders',
    label: 'In progress',
    value: kpiValue(wo, 'in_progress'),
    tone: 'yellow',
    rows: woRows,
    bucket: 'work_orders',
    field: 'in_progress',
    match: (row) => row.status === 'in_progress',
  })
  addActivity({
    key: 'work_orders.completed',
    module: 'work_orders',
    label: 'Completed',
    value: sumValues(wo, ['completed', 'verified', 'closed']),
    tone: 'green',
    rows: woRows,
    bucket: 'work_orders',
    field: 'completed',
    match: (row) => ['completed', 'verified', 'closed'].includes(row.status),
  })
  addActivity({
    key: 'work_orders.overdue',
    module: 'work_orders',
    label: 'Overdue',
    value: kpiValue(wo, 'overdue'),
    tone: 'purple',
    inverse: true,
    rows: woRows,
    bucket: 'work_orders',
    field: 'overdue',
    match: (row) => isOverdueWorkOrder(row, nowMs),
  })
  addActivity({
    key: 'work_requests.total',
    module: 'work_requests',
    label: 'Work requests',
    value: kpiValue(wr, 'total'),
    tone: 'blue',
    rows: wrRows,
    bucket: 'work_requests',
    field: 'total',
    match: () => true,
  })
  addStatic({
    key: 'work_requests.pending_approval',
    module: 'work_requests',
    label: 'WR pending approval',
    value: kpiValue(wr, 'pending_approval'),
    tone: 'yellow',
  })
  addStatic({
    key: 'work_requests.approved',
    module: 'work_requests',
    label: 'WR approved',
    value: kpiValue(wr, 'approved'),
    tone: 'green',
  })
  addStatic({
    key: 'work_requests.converted',
    module: 'work_requests',
    label: 'WR converted',
    value: kpiValue(wr, 'converted'),
    tone: 'purple',
  })
  addActivity({
    key: 'pm.total',
    module: 'pm',
    label: 'PM schedules',
    value: kpiValue(pm, 'total'),
    tone: 'blue',
    rows: pmRows,
    bucket: 'pm_plans',
    field: 'total',
    match: () => true,
  })
  addStatic({
    key: 'pm.active',
    module: 'pm',
    label: 'PM active',
    value: kpiValue(pm, 'active'),
    tone: 'green',
  })
  addStatic({
    key: 'pm.overdue',
    module: 'pm',
    label: 'PM overdue',
    value: kpiValue(pm, 'overdue'),
    tone: 'purple',
    inverse: true,
  })
  addActivity({
    key: 'tasks.open',
    module: 'tasks',
    label: 'Open tasks',
    value: kpiValue(tasks, 'open'),
    tone: 'yellow',
    rows: taskRows,
    bucket: 'tasks',
    field: 'open',
    match: (row) => !rel(row.status)?.is_terminal,
  })
  addActivity({
    key: 'tasks.total',
    module: 'tasks',
    label: 'Tasks',
    value: kpiValue(tasks, 'total'),
    tone: 'blue',
    rows: taskRows,
    bucket: 'tasks',
    field: 'total',
    match: () => true,
  })
  addStatic({
    key: 'tasks.done',
    module: 'tasks',
    label: 'Tasks done',
    value: kpiValue(tasks, 'done'),
    tone: 'green',
  })
  addStatic({
    key: 'warranties.total',
    module: 'warranties',
    label: 'Warranties',
    value: kpiValue(warranties, 'total'),
    tone: 'green',
  })
  addStatic({
    key: 'warranties.expiring_soon',
    module: 'warranties',
    label: 'Warranties expiring',
    value: kpiValue(warranties, 'expiring_soon'),
    tone: 'yellow',
    inverse: true,
  })
  addStatic({
    key: 'warranties.expired',
    module: 'warranties',
    label: 'Warranties expired',
    value: kpiValue(warranties, 'expired'),
    tone: 'red',
    inverse: true,
  })
  addStatic({
    key: 'assets.equipment',
    module: 'assets',
    label: 'Assets',
    value: kpiValue(assets, 'equipment'),
    tone: 'blue',
  })
  addStatic({
    key: 'assets.areas',
    module: 'assets',
    label: 'Areas',
    value: kpiValue(assets, 'areas'),
    tone: 'green',
  })
  addStatic({
    key: 'assets.fields',
    module: 'assets',
    label: 'Asset fields',
    value: kpiValue(assets, 'fields'),
    tone: 'purple',
  })
  addStatic({
    key: 'vendors.total',
    module: 'vendors',
    label: 'Vendors',
    value: kpiValue(vendors, 'total'),
    tone: 'blue',
  })
  addStatic({
    key: 'company.locations',
    module: 'company',
    label: 'Locations',
    value: kpiValue(company, 'locations'),
    tone: 'red',
    limit: kpiMeta(company, 'locations')?.limit,
  })
  addStatic({
    key: 'company.departments',
    module: 'company',
    label: 'Departments',
    value: kpiValue(company, 'departments'),
    tone: 'yellow',
    limit: kpiMeta(company, 'departments')?.limit,
  })
  addStatic({
    key: 'company.employees',
    module: 'company',
    label: 'Employees',
    value: kpiValue(company, 'employees'),
    tone: 'green',
    limit: kpiMeta(company, 'employees')?.limit,
  })
  addStatic({
    key: 'company.work_centers',
    module: 'company',
    label: 'Work centers',
    value: kpiValue(company, 'work_centers'),
    tone: 'blue',
  })
  addStatic({
    key: 'company.logins',
    module: 'company',
    label: 'Logins',
    value: kpiValue(company, 'logins'),
    tone: 'purple',
    limit: kpiMeta(company, 'logins')?.limit,
  })
  addStatic({
    key: 'calendar.upcoming',
    module: 'calendar',
    label: 'Calendar (14 days)',
    value: kpiValue(calendar, 'upcoming'),
    tone: 'blue',
  })
  addStatic({
    key: 'others.checklists',
    module: 'others',
    label: 'Checklists',
    value: kpiValue(others, 'checklists'),
    tone: 'green',
  })
  addStatic({
    key: 'others.statuses',
    module: 'others',
    label: 'Statuses',
    value: kpiValue(others, 'statuses'),
    tone: 'yellow',
  })
  addStatic({
    key: 'others.limits',
    module: 'others',
    label: 'Character limits',
    value: kpiValue(others, 'limits'),
    tone: 'purple',
  })
  addStatic({
    key: 'roles.total',
    module: 'roles',
    label: 'Roles',
    value: kpiValue(roles, 'total'),
    tone: 'red',
  })
  addStatic({
    key: 'notifications.unread',
    module: 'notifications',
    label: 'Unread alerts',
    value: kpiValue(notifications, 'unread'),
    tone: 'red',
  })

  return cards
}

function buildDonuts(modules) {
  const wo = moduleById(modules, 'work_orders')
  const wr = moduleById(modules, 'work_requests')
  const pm = moduleById(modules, 'pm')
  const tasks = moduleById(modules, 'tasks')
  const warranties = moduleById(modules, 'warranties')
  const calendar = moduleById(modules, 'calendar')
  const donuts = []

  if (wo) {
    const open = kpiValue(wo, 'queue') || 0
    const inProgress = kpiValue(wo, 'in_progress') || 0
    const completed = sumValues(wo, ['completed', 'verified', 'closed']) || 0
    const cancelled = kpiValue(wo, 'cancelled') || 0
    donuts.push(donut('work_orders_status', 'Work orders by status', [
      { key: 'open', label: 'Open', count: open, color: TONES.red, includeZero: true },
      { key: 'in_progress', label: 'In progress', count: inProgress, color: TONES.yellow, includeZero: true },
      { key: 'completed', label: 'Completed', count: completed, color: TONES.green, includeZero: true },
      ...(cancelled ? [{ key: 'cancelled', label: 'Cancelled', count: cancelled, color: '#64748B' }] : []),
    ]))
    donuts.push(donut('work_orders_priority', 'Work orders by priority', [
      { key: 'high', label: 'High', count: kpiValue(wo, 'high') || 0, color: TONES.red, includeZero: true },
      { key: 'medium', label: 'Medium', count: kpiValue(wo, 'medium') || 0, color: TONES.yellow, includeZero: true },
      { key: 'low', label: 'Low', count: kpiValue(wo, 'low') || 0, color: TONES.green, includeZero: true },
    ]))
  }

  if (wr) {
    const count = (keys) => keys.reduce((sum, key) => sum + statusValue(wr, key), 0)
    donuts.push(donut('work_requests_status', 'Work requests by status', [
      { key: 'new', label: 'New', count: count(['draft', 'submitted']), color: TONES.blue, includeZero: true },
      { key: 'under_review', label: 'Under review', count: count(['pending_approval', 'need_info', 'info_provided']), color: TONES.yellow, includeZero: true },
      { key: 'approved', label: 'Approved', count: kpiValue(wr, 'approved') || 0, color: TONES.green, includeZero: true },
      { key: 'rejected', label: 'Rejected', count: kpiValue(wr, 'rejected') || 0, color: TONES.red, includeZero: true },
      { key: 'converted', label: 'Converted', count: kpiValue(wr, 'converted') || 0, color: TONES.purple, includeZero: true },
      ...((kpiValue(wr, 'cancelled') || 0) > 0
        ? [{ key: 'cancelled', label: 'Cancelled', count: kpiValue(wr, 'cancelled') || 0, color: '#64748B' }]
        : []),
    ]))
  }

  if (pm) {
    donuts.push(donut('pm_status', 'PM schedules by status', [
      { key: 'active', label: 'Active', count: kpiValue(pm, 'active') || 0, color: TONES.green, includeZero: true },
      { key: 'overdue', label: 'Overdue', count: kpiValue(pm, 'overdue') || 0, color: TONES.red, includeZero: true },
      { key: 'inactive', label: 'Inactive', count: kpiValue(pm, 'inactive') || 0, color: '#64748B', includeZero: true },
    ]))
  }

  const taskDonut = tasks ? donutFromCounts('tasks_status', 'Tasks by status', tasks.status_counts) : null
  if (taskDonut) donuts.push(taskDonut)

  const warrantyDonut = warranties
    ? donutFromCounts('warranty_status', 'Warranties by status', warranties.status_counts)
    : null
  if (warrantyDonut) donuts.push(warrantyDonut)

  const calendarDonut = calendar
    ? donutFromCounts('calendar_sources', 'Calendar by source', calendar.status_counts)
    : null
  if (calendarDonut) donuts.push(calendarDonut)

  return donuts.filter(Boolean)
}

function buildTrends({ window, woRows, wrRows, pmRows, taskRows, modules, daily = null }) {
  const trends = []
  const nowMs = Date.now()
  if (daily) {
    if (moduleById(modules, 'work_orders')) {
      trends.push(trendBlockFromDaily('work_orders', 'Work orders trend', daily.work_orders, [
        { key: 'open', label: 'Open', color: TONES.red, field: 'open' },
        { key: 'in_progress', label: 'In progress', color: TONES.yellow, field: 'in_progress' },
        { key: 'completed', label: 'Completed', color: TONES.green, field: 'completed' },
        { key: 'overdue', label: 'Overdue', color: TONES.purple, field: 'overdue' },
      ], window.days))
    }
    if (moduleById(modules, 'work_requests')) {
      trends.push(trendBlockFromDaily('work_requests', 'Work requests trend', daily.work_requests, [
        { key: 'new', label: 'New', color: TONES.blue, field: 'new' },
        { key: 'under_review', label: 'Under review', color: TONES.yellow, field: 'under_review' },
        { key: 'approved', label: 'Approved', color: TONES.green, field: 'approved' },
        { key: 'rejected', label: 'Rejected', color: TONES.red, field: 'rejected' },
      ], window.days))
    }
    if (moduleById(modules, 'pm')) {
      trends.push(trendBlockFromDaily('pm', 'PM schedules trend', daily.pm_plans, [
        { key: 'active', label: 'Active', color: TONES.blue, field: 'active' },
        { key: 'overdue', label: 'Overdue', color: TONES.red, field: 'overdue' },
        { key: 'inactive', label: 'Inactive', color: '#64748B', field: 'inactive' },
      ], window.days))
    }
    if (moduleById(modules, 'tasks')) {
      trends.push(trendBlockFromDaily('tasks', 'Tasks trend', daily.tasks, [
        { key: 'open', label: 'Open', color: TONES.yellow, field: 'open' },
        { key: 'done', label: 'Done', color: TONES.green, field: 'done' },
      ], window.days))
    }
    return trends.filter(Boolean)
  }
  if (moduleById(modules, 'work_orders')) {
    trends.push(trendBlock('work_orders', 'Work orders trend', woRows, [
      { key: 'open', label: 'Open', color: TONES.red, match: (row) => ['draft', 'assigned', 'accepted'].includes(row.status) },
      { key: 'in_progress', label: 'In progress', color: TONES.yellow, match: (row) => row.status === 'in_progress' },
      { key: 'completed', label: 'Completed', color: TONES.green, match: (row) => ['completed', 'verified', 'closed'].includes(row.status) },
      { key: 'overdue', label: 'Overdue', color: TONES.purple, match: (row) => isOverdueWorkOrder(row, nowMs) },
    ], window.days))
  }
  if (moduleById(modules, 'work_requests')) {
    trends.push(trendBlock('work_requests', 'Work requests trend', wrRows, [
      { key: 'new', label: 'New', color: TONES.blue, match: (row) => ['draft', 'submitted'].includes(row.status) },
      { key: 'under_review', label: 'Under review', color: TONES.yellow, match: (row) => ['pending_approval', 'need_info', 'info_provided'].includes(row.status) },
      { key: 'approved', label: 'Approved', color: TONES.green, match: (row) => row.status === 'approved' },
      { key: 'rejected', label: 'Rejected', color: TONES.red, match: (row) => row.status === 'rejected' },
    ], window.days))
  }
  if (moduleById(modules, 'pm')) {
    trends.push(trendBlock('pm', 'PM schedules trend', pmRows, [
      { key: 'active', label: 'Active', color: TONES.blue, match: (row) => row.status === 'active' },
      { key: 'overdue', label: 'Overdue', color: TONES.red, match: (row) => row.status === 'overdue' },
      { key: 'inactive', label: 'Inactive', color: '#64748B', match: (row) => row.status === 'inactive' },
    ], window.days))
  }
  if (moduleById(modules, 'tasks')) {
    trends.push(trendBlock('tasks', 'Tasks trend', taskRows, [
      { key: 'open', label: 'Open', color: TONES.yellow, match: (row) => !rel(row.status)?.is_terminal },
      { key: 'done', label: 'Done', color: TONES.green, match: (row) => Boolean(rel(row.status)?.is_terminal) },
    ], window.days))
  }
  return trends.filter(Boolean)
}

async function loadLocationBreakdown(orgId, locationId, locations) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('assigned_location_id')
    .eq('org_id', orgId)
    .limit(8000)
  if (locationId) query = query.eq('assigned_location_id', locationId)
  const { data, error } = await query
  if (error) throw error
  const names = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  const counts = new Map()
  for (const row of data || []) {
    const id = row.assigned_location_id || ''
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      name: id ? (names.get(id) || 'Unknown location') : 'Unassigned',
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

async function loadRecentWorkOrders(orgId, locationId, locations, range) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, wo_number, short_description, status, priority, created_at, assigned_location_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(6)
  if (locationId) query = query.eq('assigned_location_id', locationId)
  if (range.since) query = query.gte('created_at', range.since)
  if (range.until) query = query.lte('created_at', range.until)
  const { data, error } = await query
  if (error) throw error
  const names = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  return (data || []).map((row) => ({
    id: row.id,
    wo_number: row.wo_number || String(row.id || '').slice(0, 8).toUpperCase(),
    title: row.short_description || 'Work order',
    summary: row.short_description || 'Work order',
    status: row.status,
    priority: row.priority || null,
    created_at: row.created_at,
    location_id: row.assigned_location_id || null,
    location_name: names.get(row.assigned_location_id) || null,
  }))
}

async function loadUpcomingPm(orgId, locationId, range) {
  let query = supabaseAdmin
    .from('pm_plans')
    .select('id, plan_number, name, priority, status, next_due_at, org_locations(name), equipment(name)')
    .eq('org_id', orgId)
    .in('status', ['active', 'overdue'])
    .order('next_due_at', { ascending: true })
    .limit(6)
  if (locationId) query = query.eq('location_id', locationId)
  if (range.since) query = query.gte('next_due_at', range.since)
  if (range.until) query = query.lte('next_due_at', range.until)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    title: rel(row.equipment)?.name || row.name || row.plan_number || 'PM schedule',
    plan_number: row.plan_number || null,
    location_name: rel(row.org_locations)?.name || null,
    due_at: row.next_due_at,
    priority: row.priority || null,
    status: row.status,
  }))
}

async function loadUpcomingTasks(orgId, locationId) {
  let query = supabaseAdmin
    .from('tasks')
    .select('id, title, due_date, status:status_id(name, is_terminal), priority:priority_id(name), location:location_id(name), task_assignees(employee:employee_id(name))')
    .eq('org_id', orgId)
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(40)
  if (locationId) query = query.eq('location_id', locationId)
  const { data, error } = await query
  if (error) throw error
  return (data || [])
    .filter((row) => !rel(row.status)?.is_terminal)
    .slice(0, 6)
    .map((row) => ({
      id: row.id,
      title: row.title || 'Task',
      location_name: rel(row.location)?.name || null,
      due_at: row.due_date,
      priority: rel(row.priority)?.name || null,
      assignee: rel(Array.isArray(row.task_assignees) ? row.task_assignees[0]?.employee : null)?.name || null,
      status: rel(row.status)?.name || 'Open',
    }))
}

async function loadExpiringWarranties(orgId) {
  const today = isoDay(utcToday())
  const soon = isoDay(addDays(utcToday(), 30))
  const { data, error } = await supabaseAdmin
    .from('warranties')
    .select('id, serial_number, make, warranty_end')
    .eq('org_id', orgId)
    .gte('warranty_end', today)
    .lte('warranty_end', soon)
    .order('warranty_end', { ascending: true })
    .limit(6)
  if (error) throw error
  return (data || []).map((row) => ({
    id: row.id,
    title: row.serial_number
      ? `Warranty ${row.serial_number}${row.make ? ` · ${row.make}` : ''}`
      : (row.make || 'Warranty'),
    due_at: row.warranty_end,
    status: 'expiring_soon',
  }))
}

async function loadExpiringWarrantyItems(orgId) {
  const todayDate = utcToday()
  const today = isoDay(todayDate)
  const soon = isoDay(addDays(todayDate, 30))
  const itemSelect = 'id, product_name, model_part_no, warranty_end, warranty_id, warranty:warranty_id ( serial_number, vendor, warranty_end )'
  const [ownResult, parentResult] = await Promise.all([
    supabaseAdmin
      .from('warranty_items')
      .select(itemSelect)
      .eq('org_id', orgId)
      .gte('warranty_end', today)
      .lte('warranty_end', soon)
      .order('warranty_end', { ascending: true })
      .limit(8),
    supabaseAdmin
      .from('warranties')
      .select('id, serial_number, vendor, warranty_end, warranty_items ( id, product_name, model_part_no, warranty_end )')
      .eq('org_id', orgId)
      .gte('warranty_end', today)
      .lte('warranty_end', soon)
      .order('warranty_end', { ascending: true })
      .limit(8),
  ])
  if (ownResult.error) throw ownResult.error
  if (parentResult.error) throw parentResult.error

  const rows = new Map()
  const push = (item, parent) => {
    const endDay = String(item.warranty_end || parent?.warranty_end || '').slice(0, 10)
    if (!endDay || endDay < today || endDay > soon) return
    rows.set(item.id, {
      id: item.id,
      warranty_id: item.warranty_id || parent?.id || null,
      name: item.product_name || item.model_part_no || 'Item',
      detail: [parent?.serial_number, parent?.vendor].filter(Boolean).join(' · '),
      warranty_end: endDay,
      days: Math.round((new Date(`${endDay}T00:00:00Z`) - todayDate) / 86400000),
    })
  }

  for (const row of ownResult.data || []) push(row, rel(row.warranty))
  for (const parent of parentResult.data || []) {
    for (const item of parent.warranty_items || []) {
      if (item.warranty_end) continue
      push({ ...item, warranty_id: parent.id }, parent)
    }
  }

  return [...rows.values()]
    .sort((a, b) => a.warranty_end.localeCompare(b.warranty_end) || a.name.localeCompare(b.name))
    .slice(0, 5)
}

const REQUEST_TYPE_LABELS = {
  inter_department: 'Inter-department',
  intra_department: 'Intra-department',
  user_self: 'Self',
  manual: 'Manual',
}

const FREQUENCY_LABELS = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
  reading: 'Meter / reading',
}

function topCounts(rows, labelOf, limit = 5) {
  const counts = new Map()
  for (const row of rows || []) {
    const label = labelOf(row)
    if (!label) continue
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function calendarUnit(row) {
  const raw = row?.working_shift
  if (typeof raw === 'string' && raw.startsWith('pm_schedule_v1:')) {
    try {
      const parsed = JSON.parse(raw.slice('pm_schedule_v1:'.length))
      if (parsed?.calendar_unit && FREQUENCY_LABELS[parsed.calendar_unit]) return parsed.calendar_unit
    } catch {
      // packed schedule meta is optional
    }
  }
  const legacy = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    quarterly: 'quarter',
    half_yearly: 'half_yearly',
    yearly: 'yearly',
    reading: 'reading',
    runtime: 'reading',
    meter: 'reading',
  }
  return legacy[row?.schedule_type] || 'month'
}

async function loadRequestBreakdown(orgId, locations) {
  const { data, error } = await supabaseAdmin
    .from('work_requests')
    .select('job_nature, request_type, order_to:departments!work_requests_order_to_department_id_fkey(location_id)')
    .eq('org_id', orgId)
    .limit(3000)
  if (error) throw error
  const names = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  const categories = topCounts(data, (row) => {
    const nature = String(row.job_nature || '').trim()
    if (nature) return nature
    return REQUEST_TYPE_LABELS[row.request_type] || 'Unspecified'
  })
  const byLocation = topCounts(data, (row) => {
    const locationId = rel(row.order_to)?.location_id
    return locationId ? (names.get(locationId) || 'Unknown location') : 'Unassigned'
  })
  return { categories, byLocation }
}

async function loadPmFrequency(orgId, locationId) {
  let query = supabaseAdmin
    .from('pm_plans')
    .select('schedule_type, working_shift')
    .eq('org_id', orgId)
    .limit(3000)
  if (locationId) query = query.eq('location_id', locationId)
  const { data, error } = await query
  if (error) throw error
  const counts = new Map()
  for (const row of data || []) {
    const unit = calendarUnit(row)
    counts.set(unit, (counts.get(unit) || 0) + 1)
  }
  const order = ['day', 'week', 'month', 'quarter', 'half_yearly', 'yearly', 'reading']
  const colors = ['#3B82F6', '#22C55E', '#8B5CF6', '#F59E0B', '#14B8A6', '#E63946', '#64748B']
  return order
    .filter((key) => counts.get(key))
    .map((key, index) => ({
      key,
      label: FREQUENCY_LABELS[key] || key,
      count: counts.get(key) || 0,
      color: colors[index % colors.length],
    }))
}

async function loadWarrantyExtras(orgId) {
  const { data, error } = await supabaseAdmin
    .from('warranties')
    .select('warranty_end, vendor, vendor_record:vendor_id(name)')
    .eq('org_id', orgId)
    .limit(3000)
  if (error) throw error
  const today = utcToday()
  const months = []
  for (let index = 5; index >= 0; index -= 1) {
    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - index, 1))
    months.push(isoDay(cursor).slice(0, 7))
  }
  const trend = months.map((month) => ({ month, date: dayLabel(`${month}-01`).replace(/\s+\d+$/, ''), expiring: 0, expired: 0 }))
  const index = new Map(trend.map((row, i) => [row.month, i]))
  for (const row of data || []) {
    if (!row.warranty_end) continue
    const month = String(row.warranty_end).slice(0, 7)
    if (!index.has(month)) continue
    const end = new Date(`${String(row.warranty_end).slice(0, 10)}T00:00:00Z`)
    const bucket = trend[index.get(month)]
    if (end < today) bucket.expired += 1
    else bucket.expiring += 1
  }
  const vendors = topCounts(data, (row) => rel(row.vendor_record)?.name || row.vendor || null, 5)
  return {
    trend: trend.map(({ date, expiring, expired }) => ({
      date,
      values: { expiring, expired },
    })),
    vendors,
  }
}

async function loadAssetBreakdown(orgId, locationId, locations) {
  let equipmentQuery = supabaseAdmin
    .from('equipment')
    .select('id, is_active, location_id, departments(name), org_locations(name)')
    .eq('org_id', orgId)
    .limit(3000)
  if (locationId) equipmentQuery = equipmentQuery.eq('location_id', locationId)
  let openQuery = supabaseAdmin
    .from('manual_work_orders')
    .select('equipment_id')
    .eq('org_id', orgId)
    .in('status', ['assigned', 'accepted', 'in_progress'])
    .not('equipment_id', 'is', null)
    .limit(3000)
  if (locationId) openQuery = openQuery.eq('assigned_location_id', locationId)
  const [equipmentResult, openResult] = await Promise.all([equipmentQuery, openQuery])
  if (equipmentResult.error) throw equipmentResult.error
  if (openResult.error) throw openResult.error
  const rows = equipmentResult.data || []
  const names = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  const maintenance = new Set((openResult.data || []).map((row) => row.equipment_id).filter(Boolean))
  return {
    total: rows.length,
    operational: rows.filter((row) => row.is_active !== false && !maintenance.has(row.id)).length,
    maintenance: rows.filter((row) => maintenance.has(row.id)).length,
    inactive: rows.filter((row) => row.is_active === false).length,
    departments: topCounts(rows, (row) => rel(row.departments)?.name || 'Unassigned'),
    locations: topCounts(rows, (row) => rel(row.org_locations)?.name || names.get(row.location_id) || 'Unassigned'),
  }
}

async function loadOverdueOrders(orgId, locationId, locations) {
  let query = supabaseAdmin
    .from('manual_work_orders')
    .select('id, wo_number, short_description, priority, status, planned_end_at, scheduled_at, assigned_location_id')
    .eq('org_id', orgId)
    .in('status', ['assigned', 'accepted', 'in_progress'])
    .order('planned_end_at', { ascending: true })
    .limit(80)
  if (locationId) query = query.eq('assigned_location_id', locationId)
  const { data, error } = await query
  if (error) throw error
  const names = new Map((locations || []).map((loc) => [loc.id, loc.name]))
  const now = Date.now()
  return (data || [])
    .map((row) => {
      const due = row.planned_end_at || row.scheduled_at
      if (!due) return null
      const dueMs = new Date(due).getTime()
      if (!Number.isFinite(dueMs) || dueMs >= now) return null
      const days = Math.max(1, Math.ceil((now - dueMs) / 86400000))
      return {
        id: row.id,
        wo_number: row.wo_number || String(row.id).slice(0, 8).toUpperCase(),
        title: row.short_description || 'Work order',
        location_name: names.get(row.assigned_location_id) || '—',
        due_at: due,
        days,
        priority: row.priority || null,
        location_id: row.assigned_location_id || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.days - a.days)
    .slice(0, 6)
}

async function loadActivity(orgId, locationId) {
  const jobs = [
    supabaseAdmin
      .from('work_requests')
      .select('id, request_number, short_description, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(4),
    (() => {
      let query = supabaseAdmin
        .from('manual_work_orders')
        .select('id, wo_number, short_description, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(4)
      if (locationId) query = query.eq('assigned_location_id', locationId)
      return query
    })(),
    (() => {
      let query = supabaseAdmin
        .from('pm_plans')
        .select('id, plan_number, name, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3)
      if (locationId) query = query.eq('location_id', locationId)
      return query
    })(),
  ]
  const [requests, orders, plans] = await Promise.all(jobs)
  const items = []
  for (const row of requests.data || []) {
    items.push({
      id: `wr-${row.id}`,
      kind: 'work_request',
      title: 'New work request',
      detail: [row.request_number, row.short_description].filter(Boolean).join(' · '),
      at: row.created_at,
    })
  }
  for (const row of orders.data || []) {
    items.push({
      id: `wo-${row.id}`,
      kind: 'work_order',
      title: 'Work order created',
      detail: [row.wo_number, row.short_description].filter(Boolean).join(' · '),
      at: row.created_at,
    })
  }
  for (const row of plans.data || []) {
    items.push({
      id: `pm-${row.id}`,
      kind: 'pm',
      title: 'PM schedule added',
      detail: [row.plan_number, row.name].filter(Boolean).join(' · '),
      at: row.created_at,
    })
  }
  return items
    .filter((item) => item.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 6)
}

function labeledTop(rows, labelOf, limit = 5) {
  const counts = new Map()
  for (const row of rows || []) {
    const label = labelOf(row)
    if (!label) continue
    counts.set(label, (counts.get(label) || 0) + (Number(row.count) || 0))
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function locationNames(locations) {
  return new Map((locations || []).map((loc) => [loc.id, loc.name]))
}

function locationBarsFromCounts(rows, locations) {
  const names = locationNames(locations)
  return labeledTop(rows, (row) => (
    row.location_id ? (names.get(row.location_id) || 'Unknown location') : 'Unassigned'
  ))
}

function requestBoardFromAggregates(requests, locations) {
  const names = locationNames(locations)
  return {
    categories: (requests?.categories || [])
      .map((row) => ({ name: row.name, count: Number(row.count) || 0 }))
      .filter((row) => row.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    byLocation: labeledTop(requests?.locations, (row) => (
      row.location_id ? (names.get(row.location_id) || 'Unknown location') : 'Unassigned'
    )),
  }
}

function pmFrequencyFromCounts(rows) {
  const counts = new Map((rows || []).map((row) => [row.key, Number(row.count) || 0]))
  const order = ['day', 'week', 'month', 'quarter', 'half_yearly', 'yearly', 'reading']
  const colors = ['#3B82F6', '#22C55E', '#8B5CF6', '#F59E0B', '#14B8A6', '#E63946', '#64748B']
  return order
    .filter((key) => counts.get(key))
    .map((key, index) => ({
      key,
      label: FREQUENCY_LABELS[key] || key,
      count: counts.get(key) || 0,
      color: colors[index % colors.length],
    }))
}

function warrantyExtrasFromAggregates(warranties) {
  const today = utcToday()
  const months = []
  for (let index = 5; index >= 0; index -= 1) {
    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - index, 1))
    months.push(isoDay(cursor).slice(0, 7))
  }
  const counts = new Map((warranties?.trend || []).map((row) => [String(row.month), row]))
  const trend = months.map((month) => {
    const row = counts.get(month) || {}
    return {
      date: dayLabel(`${month}-01`).replace(/\s+\d+$/, ''),
      values: {
        expiring: Number(row.expiring) || 0,
        expired: Number(row.expired) || 0,
      },
    }
  })
  const vendors = (warranties?.vendors || [])
    .map((row) => ({ name: row.name, count: Number(row.count) || 0 }))
    .filter((row) => row.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  return { trend, vendors }
}

function assetsFromAggregates(assets) {
  if (!assets) return null
  const pairs = (rows) => (rows || [])
    .map((row) => ({ name: row.name, count: Number(row.count) || 0 }))
    .filter((row) => row.name)
  return {
    total: Number(assets.total) || 0,
    operational: Number(assets.operational) || 0,
    maintenance: Number(assets.maintenance) || 0,
    inactive: Number(assets.inactive) || 0,
    departments: pairs(assets.departments),
    locations: pairs(assets.locations),
  }
}

function applyListLocationNames(recent, overdue, locations) {
  const names = locationNames(locations)
  return {
    recent: (recent || []).map((row) => {
      const { location_id, ...rest } = row
      return {
        ...rest,
        location_name: location_id ? (names.get(location_id) || null) : null,
      }
    }),
    overdue: (overdue || []).map((row) => {
      const { location_id, ...rest } = row
      return {
        ...rest,
        location_name: names.get(location_id) || '—',
      }
    }),
  }
}

function isMissingRpc(err) {
  const message = String(err?.message || err?.code || err?.details || '')
  return /could not find the function|PGRST202|does not exist/i.test(message)
}

let chartAggregateRpcAvailable = true

export async function loadDashboardAggregates({
  orgId,
  locationId = null,
  dateFrom = null,
  dateTo = null,
  createdFrom = null,
  createdTo = null,
  pmFrom = null,
  pmTo = null,
  calendarFrom = null,
  calendarTo = null,
  timeZone = 'UTC',
}) {
  if (!chartAggregateRpcAvailable) return null
  const window = resolveWindow(dateFrom, dateTo)
  const zone = /^[A-Za-z0-9_+\-/]+$/.test(String(timeZone || '')) ? timeZone : 'UTC'
  try {
    const { data, error } = await supabaseAdmin.rpc('org_dashboard_chart_aggregates', {
      p_org_id: orgId,
      p_location_id: locationId || null,
      p_since: window.since,
      p_until: window.until,
      p_date_from: createdFrom || null,
      p_date_to: createdTo || null,
      p_pm_from: pmFrom || null,
      p_pm_to: pmTo || null,
      p_calendar_from: calendarFrom,
      p_calendar_to: calendarTo,
      p_now: new Date().toISOString(),
      p_tz: zone,
    })
    if (error) throw error
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    if (!parsed || typeof parsed !== 'object') return null
    const kpis = parsed.wo_kpis || {}
    return {
      ...parsed,
      source: 'chart',
      work_orders_manual: Number(kpis.manual) || 0,
      work_orders_scheduled: Number(kpis.scheduled) || 0,
      work_orders_open: Number(kpis.open) || 0,
      priorities: {
        high: Number(kpis.high) || 0,
        medium: Number(kpis.medium) || 0,
        low: Number(kpis.low) || 0,
      },
      overdue: Number(kpis.overdue) || 0,
      daily: parsed.daily || {},
    }
  } catch (err) {
    if (isMissingRpc(err)) chartAggregateRpcAvailable = false
    console.error('[dashboardCharts] chart aggregate RPC', err.message)
    return null
  }
}

export async function loadDashboardChartLists({
  orgId,
  locationId = null,
  dateFrom = null,
  dateTo = null,
  include = {},
}) {
  const window = resolveWindow(dateFrom, dateTo)
  const userRange = window.compare ? {} : { since: window.since, until: window.until }
  const [recent, upcomingPm, upcomingTasks, expiring, overdueOrders, activity] = await Promise.all([
    include.workOrders
      ? loadSafe(() => loadRecentWorkOrders(orgId, locationId, [], userRange), [])
      : [],
    include.pm
      ? loadSafe(() => loadUpcomingPm(orgId, locationId, userRange), [])
      : [],
    include.tasks
      ? loadSafe(() => loadUpcomingTasks(orgId, locationId), [])
      : [],
    include.warranties
      ? loadSafe(() => loadExpiringWarranties(orgId), [])
      : [],
    include.workOrders
      ? loadSafe(() => loadOverdueOrders(orgId, locationId, []), [])
      : [],
    (include.workOrders || include.workRequests || include.pm)
      ? loadSafe(() => loadActivity(orgId, locationId), [])
      : [],
  ])
  return { recent, upcomingPm, upcomingTasks, expiring, overdueOrders, activity }
}

export async function buildDashboardCharts({
  orgId,
  locationId = null,
  locations = [],
  modules = [],
  dateFrom = null,
  dateTo = null,
  aggregates = null,
  lists = null,
}) {
  const window = resolveWindow(dateFrom, dateTo)
  const userRange = window.compare ? {} : { since: window.since, until: window.until }
  const has = (id) => Boolean(moduleById(modules, id))
  const chartReady = Boolean(aggregates?.daily)

  const [woRows, wrRows, pmRows, taskRows, locationBars, recent, upcomingPm, upcomingTasks, expiring, expiringItems, requestBreakdown, pmFrequency, warrantyExtras, assetBreakdown, overdueOrders, activity] = await Promise.all([
    [],
    [],
    [],
    [],
    chartReady && has('work_orders')
      ? (aggregates?.location_bars || [])
      : [],
    has('work_orders')
      ? (lists?.recent ?? loadSafe(() => loadRecentWorkOrders(orgId, locationId, locations, userRange), []))
      : [],
    has('pm')
      ? (lists?.upcomingPm ?? loadSafe(() => loadUpcomingPm(orgId, locationId, userRange), []))
      : [],
    has('tasks')
      ? (lists?.upcomingTasks ?? loadSafe(() => loadUpcomingTasks(orgId, locationId), []))
      : [],
    has('warranties')
      ? (lists?.expiring ?? loadSafe(() => loadExpiringWarranties(orgId), []))
      : [],
    has('warranties')
      ? loadSafe(() => loadExpiringWarrantyItems(orgId), [])
      : [],
    { categories: [], byLocation: [] },
    chartReady && has('pm') ? (aggregates?.pm_frequency || []) : [],
    { trend: [], vendors: [] },
    null,
    has('work_orders')
      ? (lists?.overdueOrders ?? loadSafe(() => loadOverdueOrders(orgId, locationId, locations), []))
      : [],
    (has('work_orders') || has('work_requests') || has('pm'))
      ? (lists?.activity ?? loadSafe(() => loadActivity(orgId, locationId), []))
      : [],
  ])

  const namedLists = applyListLocationNames(recent, overdueOrders, locations)
  const requestBoard = chartReady && has('work_requests')
    ? requestBoardFromAggregates(aggregates.requests, locations)
    : requestBreakdown
  const warrantyBoard = chartReady && has('warranties')
    ? warrantyExtrasFromAggregates(aggregates.warranties)
    : warrantyExtras

  return {
    range_label: window.label,
    kpis: buildHeadlines({
      modules,
      window,
      woRows,
      wrRows,
      pmRows,
      taskRows,
      daily: chartReady ? aggregates.daily : null,
      nowMs: Date.now(),
    }),
    donuts: buildDonuts(modules),
    trends: buildTrends({
      window,
      woRows,
      wrRows,
      pmRows,
      taskRows,
      modules,
      daily: chartReady ? aggregates.daily : null,
    }),
    locations: chartReady && has('work_orders')
      ? locationBarsFromCounts(aggregates.locations, locations)
      : locationBars,
    recent_work_orders: namedLists.recent,
    upcoming_pm: upcomingPm,
    upcoming_tasks: upcomingTasks,
    expiring_warranties: expiring,
    board: {
      request_categories: requestBoard?.categories || [],
      request_locations: requestBoard?.byLocation || [],
      pm_frequency: chartReady && has('pm')
        ? pmFrequencyFromCounts(aggregates.frequency)
        : (pmFrequency || []),
      warranty_trend: warrantyBoard?.trend || [],
      warranty_vendors: warrantyBoard?.vendors || [],
      expiring_items: expiringItems || [],
      assets: chartReady && has('assets')
        ? assetsFromAggregates(aggregates.assets)
        : assetBreakdown,
      overdue_orders: namedLists.overdue,
      activity: activity || [],
    },
  }
}
