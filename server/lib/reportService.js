import { supabaseAdmin } from '../services/supabase.js'
import { sanitizeDailyLogMaterials } from './workOrderDailyLogService.js'
import { displayWorkOrderNumber } from './workOrderService.js'
import { resolveLivePlanStatus } from './pmSchedule.js'
import { resolveLocationFilter } from './orgPermissions.js'
import {
  agingDays,
  columnsForReport,
  defaultDateRange,
  getReportCatalog,
  hoursWorked,
  isoDate,
  isWorkOrderOverdue,
  previousEqualRange,
  WO_IN_PROGRESS_STATUSES,
  WO_OPEN_STATUSES,
  WO_TERMINAL_STATUSES,
  workOrderDueAt,
} from './reportConstants.js'

const LOG_SELECT = 'id, org_id, work_order_id, log_date, started_at, ended_at, day_status, work_done, remarks, labour_count, materials'
const WO_SELECT = [
  'id',
  'wo_number',
  'short_description',
  'problem_description',
  'status',
  'priority',
  'source_type',
  'assigned_location_id',
  'assigned_department_id',
  'equipment_id',
  'work_request_id',
  'pm_plan_id',
  'planned_start_at',
  'planned_end_at',
  'scheduled_at',
  'work_start_at',
  'work_end_at',
  'created_at',
  'updated_at',
  'breakdown_duration_hours',
].join(', ')

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

function inPeriod(iso, dateFrom, dateTo) {
  if (!iso) return false
  const day = String(iso).slice(0, 10)
  return day >= dateFrom && day <= dateTo
}

function formatMaterialsCell(raw) {
  return sanitizeDailyLogMaterials(raw)
    .map((row) => {
      const name = [row.code, row.description].filter(Boolean).join(' — ')
      const qty = [row.qty, row.uom].filter(Boolean).join(' ')
      return [name, qty].filter(Boolean).join(' ')
    })
    .join('; ')
}

function materialQtyTotal(raw) {
  return sanitizeDailyLogMaterials(raw).reduce((sum, row) => {
    const qty = Number(row.qty)
    return sum + (Number.isFinite(qty) ? qty : 0)
  }, 0)
}

function matchesSearch(haystack, search) {
  if (!search) return true
  return String(haystack || '').toLowerCase().includes(search)
}

async function fetchAllPages(buildQuery, { pageSize = 1000, maxRows = 20000 } = {}) {
  const rows = []
  let from = 0
  while (from < maxRows) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const { data, error } = await buildQuery().range(from, to)
    if (error) throw error
    const chunk = data || []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function fetchByIds(table, select, ids) {
  const map = new Map()
  const unique = [...new Set((ids || []).filter(Boolean))]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(select)
      .in('id', chunk)
    if (error) throw error
    for (const row of data || []) map.set(row.id, row)
  }
  return map
}

async function loadAssigneesByWorkOrder(orgId, workOrderIds) {
  const map = new Map()
  const unique = [...new Set((workOrderIds || []).filter(Boolean))]
  if (!unique.length) return map

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabaseAdmin
      .from('manual_work_order_assignees')
      .select('work_order_id, org_employees(id, name)')
      .eq('org_id', orgId)
      .in('work_order_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      const name = row.org_employees?.name
      if (!name) continue
      if (!map.has(row.work_order_id)) map.set(row.work_order_id, [])
      map.get(row.work_order_id).push(name)
    }
  }
  return map
}

async function loadOrgName(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  return data?.name || 'Organization'
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
  return data || []
}

function resolveFilters(session, query = {}) {
  const defaults = defaultDateRange()
  const dateFrom = isoDate(query.date_from) || defaults.date_from
  const dateTo = isoDate(query.date_to) || defaults.date_to
  if (dateFrom > dateTo) throw httpError('date_from must be on or before date_to')
  const locationId = resolveLocationFilter(session, query.location_id || null)
  const search = String(query.search || '').trim().toLowerCase()
  return { dateFrom, dateTo, locationId, search }
}

async function loadWorkOrders(orgId, { locationId, statuses, excludeStatuses } = {}) {
  return fetchAllPages(() => {
    let query = supabaseAdmin
      .from('manual_work_orders')
      .select(WO_SELECT)
      .eq('org_id', orgId)
    if (locationId) query = query.eq('assigned_location_id', locationId)
    if (statuses?.length) query = query.in('status', statuses)
    if (excludeStatuses?.length) query = query.not('status', 'in', `(${excludeStatuses.join(',')})`)
    return query.order('created_at', { ascending: false })
  })
}

async function loadDailyLogs(orgId, { dateFrom, dateTo, dayStatus } = {}) {
  return fetchAllPages(() => {
    let query = supabaseAdmin
      .from('work_order_daily_logs')
      .select(LOG_SELECT)
      .eq('org_id', orgId)
      .gte('log_date', dateFrom)
      .lte('log_date', dateTo)
    if (dayStatus) query = query.eq('day_status', dayStatus)
    return query.order('log_date', { ascending: false })
  })
}

async function enrichWorkOrders(orgId, workOrders) {
  const wrIds = workOrders.map((row) => row.work_request_id)
  const eqIds = workOrders.map((row) => row.equipment_id)
  const locIds = workOrders.map((row) => row.assigned_location_id)
  const deptIds = workOrders.map((row) => row.assigned_department_id)
  const planIds = workOrders.map((row) => row.pm_plan_id)
  const woIds = workOrders.map((row) => row.id)

  const [wrMap, eqMap, locMap, deptMap, planMap, assigneeMap] = await Promise.all([
    fetchByIds('work_requests', 'id, short_description', wrIds),
    fetchByIds('equipment', 'id, name, code', eqIds),
    fetchByIds('org_locations', 'id, name', locIds),
    fetchByIds('departments', 'id, name', deptIds),
    fetchByIds('pm_plans', 'id, plan_number, name', planIds),
    loadAssigneesByWorkOrder(orgId, woIds),
  ])

  return workOrders.map((row) => {
    const equipment = eqMap.get(row.equipment_id)
    return {
      ...row,
      wo_number: displayWorkOrderNumber(row),
      short_description:
        wrMap.get(row.work_request_id)?.short_description
        || row.short_description
        || row.problem_description
        || '',
      plant: locMap.get(row.assigned_location_id)?.name || '',
      department: deptMap.get(row.assigned_department_id)?.name || '',
      equipment: equipment ? (equipment.code ? `${equipment.code} — ${equipment.name}` : equipment.name) : '',
      assignees: (assigneeMap.get(row.id) || []).join(', '),
      pm_plan_number: planMap.get(row.pm_plan_id)?.plan_number || '',
    }
  })
}

function logRowFrom(log, workOrder, now) {
  const hours = hoursWorked(log.started_at, log.ended_at, now)
  return {
    id: log.id,
    log_date: log.log_date,
    day_status: log.day_status,
    wo_number: workOrder?.wo_number || '',
    short_description: workOrder?.short_description || '',
    plant: workOrder?.plant || '',
    equipment: workOrder?.equipment || '',
    assignees: workOrder?.assignees || '',
    started_at: log.started_at,
    ended_at: log.ended_at,
    hours,
    labour: Number(log.labour_count) || 0,
    materials: formatMaterialsCell(log.materials),
    work_done: log.work_done || '',
    remarks: log.remarks || '',
    wo_status: workOrder?.status || '',
    priority: workOrder?.priority || '',
    _material_qty: materialQtyTotal(log.materials),
  }
}

function logMatchesSearch(row, search) {
  if (!search) return true
  return [
    row.log_date,
    row.day_status,
    row.wo_number,
    row.short_description,
    row.plant,
    row.equipment,
    row.assignees,
    row.work_done,
    row.remarks,
    row.wo_status,
    row.priority,
    row.materials,
  ].some((value) => matchesSearch(value, search))
}

async function buildLogReport(orgId, catalog, filters, now) {
  const logs = await loadDailyLogs(orgId, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    dayStatus: catalog.dayStatus,
  })
  const woIds = [...new Set(logs.map((row) => row.work_order_id).filter(Boolean))]
  const workOrderMap = await fetchByIds('manual_work_orders', WO_SELECT, woIds)
  const workOrders = [...workOrderMap.values()]

  const scoped = filters.locationId
    ? workOrders.filter((row) => row.assigned_location_id === filters.locationId)
    : workOrders
  const allowedIds = new Set(scoped.map((row) => row.id))
  const enriched = await enrichWorkOrders(orgId, scoped)
  const byId = new Map(enriched.map((row) => [row.id, row]))

  const rows = logs
    .filter((log) => allowedIds.has(log.work_order_id))
    .map((log) => logRowFrom(log, byId.get(log.work_order_id), now))
    .filter((row) => logMatchesSearch(row, filters.search))

  const hours = round1(rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0))
  const labour = rows.reduce((sum, row) => sum + (Number(row.labour) || 0), 0)
  const materialQty = round1(rows.reduce((sum, row) => sum + (Number(row._material_qty) || 0), 0))
  const openDays = rows.filter((row) => row.day_status === 'open').length
  const closedDays = rows.filter((row) => row.day_status === 'closed').length

  const kpis = catalog.dayStatus === 'open'
    ? [
        { key: 'open_logs', label: 'Open logs', value: rows.length },
        { key: 'hours', label: 'Hours open', value: hours },
        { key: 'labour', label: 'Labour', value: labour },
        { key: 'material_qty', label: 'Material qty', value: materialQty },
      ]
    : catalog.dayStatus === 'closed'
      ? [
          { key: 'closed_logs', label: 'Closed days', value: rows.length },
          { key: 'hours', label: 'Hours worked', value: hours },
          { key: 'labour', label: 'Labour', value: labour },
          { key: 'material_qty', label: 'Material qty', value: materialQty },
        ]
      : [
          { key: 'hours', label: 'Hours worked', value: hours },
          { key: 'labour', label: 'Labour', value: labour },
          { key: 'material_qty', label: 'Material qty', value: materialQty },
          { key: 'open_days', label: 'Open days', value: openDays },
          { key: 'closed_days', label: 'Closed days', value: closedDays },
        ]

  return {
    rows: rows.map(({ _material_qty, ...row }) => row),
    kpis,
  }
}

function plantMetrics({
  locationId,
  workOrders,
  logs,
  pmPlans,
  dateFrom,
  dateTo,
  now,
  woById,
}) {
  const wos = workOrders.filter((row) => row.assigned_location_id === locationId)
  const locLogs = logs.filter((row) => woById.get(row.work_order_id)?.assigned_location_id === locationId)

  const openWos = wos.filter((row) => WO_OPEN_STATUSES.includes(row.status)).length
  const inProgress = wos.filter((row) => WO_IN_PROGRESS_STATUSES.includes(row.status)).length
  const completed = wos.filter((row) => (
    WO_TERMINAL_STATUSES.includes(row.status)
    && inPeriod(row.work_end_at || row.updated_at, dateFrom, dateTo)
  )).length
  const overdueWos = wos.filter((row) => isWorkOrderOverdue(row, now)).length
  const breakdownHours = round1(wos.reduce((sum, row) => {
    const inRange = inPeriod(row.created_at, dateFrom, dateTo)
      || inPeriod(row.work_start_at, dateFrom, dateTo)
      || inPeriod(row.work_end_at, dateFrom, dateTo)
    if (!inRange) return sum
    return sum + (Number(row.breakdown_duration_hours) || 0)
  }, 0))
  const openLogs = locLogs.filter((row) => row.day_status === 'open').length
  const closedLogs = locLogs.filter((row) => row.day_status === 'closed').length
  const labour = locLogs.reduce((sum, row) => sum + (Number(row.labour_count) || 0), 0)
  const materialLines = locLogs.reduce((sum, row) => sum + sanitizeDailyLogMaterials(row.materials).length, 0)
  const pmOverdue = pmPlans.filter((plan) => (
    plan.location_id === locationId && resolveLivePlanStatus(plan, now) === 'overdue'
  )).length

  return {
    open_wos: openWos,
    in_progress: inProgress,
    completed,
    overdue_wos: overdueWos,
    breakdown_hours: breakdownHours,
    open_logs: openLogs,
    closed_logs: closedLogs,
    labour,
    material_lines: materialLines,
    pm_overdue: pmOverdue,
  }
}

function kpiDelta(current, previous) {
  const curr = Number(current) || 0
  const prev = Number(previous) || 0
  const delta = round1(curr - prev)
  const deltaPct = prev === 0 ? (curr === 0 ? 0 : 100) : round1((delta / prev) * 100)
  return { previous: prev, delta, delta_pct: deltaPct }
}

async function buildPlantReport(orgId, filters, now) {
  const prev = previousEqualRange(filters.dateFrom, filters.dateTo)
  const [locations, workOrders, logs, prevLogs, pmPlans] = await Promise.all([
    loadLocations(orgId, filters.locationId),
    loadWorkOrders(orgId, { locationId: filters.locationId }),
    loadDailyLogs(orgId, { dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    prev
      ? loadDailyLogs(orgId, { dateFrom: prev.date_from, dateTo: prev.date_to })
      : Promise.resolve([]),
    fetchAllPages(() => (
      supabaseAdmin
        .from('pm_plans')
        .select('id, location_id, status, next_due_at, grace_days')
        .eq('org_id', orgId)
        .neq('status', 'inactive')
    )),
  ])

  const woById = new Map(workOrders.map((row) => [row.id, row]))
  const logsForPlant = (list) => list.filter((log) => {
    const wo = woById.get(log.work_order_id)
    if (!wo) return false
    if (filters.locationId && wo.assigned_location_id !== filters.locationId) return false
    return true
  })

  const currentLogs = logsForPlant(logs)
  const previousLogs = logsForPlant(prevLogs)
  const scopedPlans = filters.locationId
    ? pmPlans.filter((plan) => plan.location_id === filters.locationId)
    : pmPlans

  const plants = (filters.locationId
    ? locations.filter((loc) => loc.id === filters.locationId)
    : locations
  ).filter((loc) => loc.is_active !== false)

  const rows = plants.map((loc) => {
    const metrics = plantMetrics({
      locationId: loc.id,
      workOrders,
      logs: currentLogs,
      pmPlans: scopedPlans,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      now,
      woById,
    })
    return { id: loc.id, plant: loc.name, ...metrics }
  }).filter((row) => {
    if (!filters.search) return true
    return matchesSearch(row.plant, filters.search)
  })

  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
  const prevTotals = plants.reduce((acc, loc) => {
    const metrics = plantMetrics({
      locationId: loc.id,
      workOrders,
      logs: previousLogs,
      pmPlans: scopedPlans,
      dateFrom: prev?.date_from || filters.dateFrom,
      dateTo: prev?.date_to || filters.dateTo,
      now,
      woById,
    })
    for (const key of Object.keys(metrics)) {
      acc[key] = (acc[key] || 0) + (Number(metrics[key]) || 0)
    }
    return acc
  }, {})

  const withDelta = (key, label, value) => ({
    key,
    label,
    value,
    ...kpiDelta(value, prevTotals[key]),
  })

  const kpis = [
    { key: 'open_wos', label: 'Open WOs', value: sum('open_wos') },
    { key: 'in_progress', label: 'In progress', value: sum('in_progress') },
    withDelta('completed', 'Completed', sum('completed')),
    { key: 'overdue_wos', label: 'Overdue WOs', value: sum('overdue_wos') },
    withDelta('breakdown_hours', 'Breakdown hours', round1(sum('breakdown_hours'))),
    withDelta('open_logs', 'Open logs', sum('open_logs')),
    { key: 'pm_overdue', label: 'PM overdue', value: sum('pm_overdue') },
  ]

  return { rows, kpis, comparison_period: prev }
}

async function buildOverdueReport(orgId, filters, now) {
  const workOrders = await loadWorkOrders(orgId, {
    locationId: filters.locationId,
    statuses: WO_OPEN_STATUSES,
  })
  const overdue = workOrders.filter((row) => isWorkOrderOverdue(row, now))
  const enriched = await enrichWorkOrders(orgId, overdue)

  const rows = enriched
    .map((row) => {
      const dueAt = workOrderDueAt(row)
      return {
        id: row.id,
        wo_number: row.wo_number,
        short_description: row.short_description,
        plant: row.plant,
        department: row.department,
        priority: row.priority || '',
        status: row.status || '',
        source: row.source_type || '',
        due_at: dueAt,
        aging_days: agingDays(dueAt, now),
        assignees: row.assignees,
        equipment: row.equipment,
        pm_plan_number: row.pm_plan_number,
      }
    })
    .filter((row) => {
      if (!filters.search) return true
      return [
        row.wo_number,
        row.short_description,
        row.plant,
        row.department,
        row.priority,
        row.status,
        row.source,
        row.assignees,
        row.equipment,
        row.pm_plan_number,
      ].some((value) => matchesSearch(value, filters.search))
    })
    .sort((a, b) => b.aging_days - a.aging_days)

  const highPriority = rows.filter((row) => ['high', 'urgent', 'critical'].includes(String(row.priority || '').toLowerCase())).length
  const avgAging = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.aging_days, 0) / rows.length)
    : 0

  const kpis = [
    { key: 'overdue', label: 'Overdue WOs', value: rows.length },
    { key: 'aging_avg', label: 'Avg aging (days)', value: avgAging },
    { key: 'high_priority', label: 'High / urgent', value: highPriority },
    { key: 'oldest', label: 'Oldest (days)', value: rows[0]?.aging_days || 0 },
  ]

  return { rows, kpis }
}

export async function getReportData(orgId, session, reportKey, query = {}, now = new Date()) {
  const catalog = getReportCatalog(reportKey)
  if (!catalog) throw httpError('Unknown report', 404)

  const filters = resolveFilters(session, query)
  const orgName = await loadOrgName(orgId)
  const locations = await loadLocations(orgId, resolveLocationFilter(session, null))

  let payload
  if (catalog.kind === 'plant') {
    payload = await buildPlantReport(orgId, filters, now)
  } else if (catalog.kind === 'overdue') {
    payload = await buildOverdueReport(orgId, filters, now)
  } else {
    payload = await buildLogReport(orgId, catalog, filters, now)
  }

  const locationName = filters.locationId
    ? (locations.find((loc) => loc.id === filters.locationId)?.name || null)
    : null

  return {
    key: catalog.key,
    title: catalog.title,
    kind: catalog.kind,
    org_name: orgName,
    generated_at: now.toISOString(),
    columns: columnsForReport(catalog.kind),
    filters: {
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      location_id: filters.locationId,
      location_name: locationName,
      search: query.search || '',
      can_select_location: !resolveLocationFilter(session, null),
    },
    locations: locations.map((loc) => ({ id: loc.id, name: loc.name })),
    kpis: payload.kpis,
    rows: payload.rows,
    comparison_period: payload.comparison_period || null,
    total: payload.rows.length,
  }
}
