import { supabaseAdmin } from '../services/supabase.js'
import { sanitizeDailyLogMaterials, rollupMaterialsFromLogs } from './workOrderDailyLogService.js'
import { displayWorkOrderNumber } from './workOrderService.js'
import { resolveLivePlanStatus } from './pmSchedule.js'
import { resolveLocationFilter } from './orgPermissions.js'
import { loadOrgFields } from './equipmentFieldService.js'
import { listOrgStatuses } from './orgStatusService.js'
import { resolveJobNatureChoiceList } from './formFieldMasters.js'
import { loadTimelineActors } from './timelineActors.js'
import {
  agingDays,
  columnsForReport,
  defaultDateRange,
  getReportCatalog,
  hoursWorked,
  isoDate,
  isWorkOrderOverdue,
  ORDER_TYPE_OPTIONS,
  previousEqualRange,
  REPORT_PRIORITY_OPTIONS,
  UNIFIED_REPORT_KEY,
  WORK_REQUEST_REPORT_KEY,
  PM_PLAN_REPORT_KEY,
  WO_IN_PROGRESS_STATUSES,
  WO_OPEN_STATUSES,
  WO_TERMINAL_STATUSES,
  workOrderDueAt,
} from './reportConstants.js'
import { resolveProgressPercent } from './statusProgress.js'
import { tallyStatusCounts } from './statusCounts.js'

const LOG_SELECT = 'id, org_id, work_order_id, log_date, started_at, ended_at, day_status, work_done, remarks, labour_count, materials, field_snapshot, updated_at'
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
  'requester_id',
  'created_by',
  'pm_plan_id',
  'planned_start_at',
  'planned_end_at',
  'scheduled_at',
  'work_start_at',
  'work_end_at',
  'created_at',
  'updated_at',
  'work_center',
  'labour_count',
  'vendor_expense',
  'breakdown_duration_hours',
  'progress_percent',
  'breakdown_start_at',
  'breakdown_end_at',
  'permit_required',
  'permit_types',
  'permit_details',
  'permit_number',
  'permit_issue_at',
  'permit_expiry_at',
  'job_description',
  'root_cause',
  'action_taken',
  'material_consumed',
  'special_tools_used',
  'safety_precautions',
  'dos_and_donts',
  'lessons_learned',
  'execution_remarks',
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

const SOURCE_LABELS = {
  approved_work_request: 'Work request',
  preventive_maintenance: 'Preventive maintenance',
  manual: 'Manual',
  breakdown: 'Work request',
  user_self_request: 'User self request',
}

const PERMIT_LABELS = {
  hot_work: 'Hot Work Permit',
  cold_work: 'Cold Work Permit',
  confined_space: 'Confined Space Permit',
  excavation: 'Excavation Permit',
  electrical_isolation: 'Electrical Isolation',
  loto: 'LOTO',
  height_work: 'Height Work',
  radiography: 'Radiography',
}

function parseJsonValue(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatDosDonts(raw) {
  const parsed = parseJsonValue(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const dos = String(parsed.dos || '').trim()
    const donts = String(parsed.donts || parsed.dont || '').trim()
    return [dos && `Do: ${dos}`, donts && `Don't: ${donts}`].filter(Boolean).join('\n')
  }
  return String(raw || '').trim()
}

function formatPermitType(row) {
  const details = Array.isArray(row.permit_details) ? row.permit_details : []
  const types = Array.isArray(row.permit_types) ? row.permit_types : []
  const type = details[0]?.type || types[0] || ''
  if (!type) return ''
  return PERMIT_LABELS[type] || String(type).replace(/_/g, ' ')
}

function permitField(row, key) {
  const details = Array.isArray(row.permit_details) ? row.permit_details : []
  const primary = details[0] || {}
  if (key === 'number') return primary.number || row.permit_number || ''
  if (key === 'issue_at') return primary.issue_at || row.permit_issue_at || ''
  if (key === 'expiry_at') return primary.expiry_at || row.permit_expiry_at || ''
  return ''
}

function parseMaterialList(raw) {
  if (Array.isArray(raw)) return raw
  const parsed = parseJsonValue(raw)
  return Array.isArray(parsed) ? parsed : []
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

async function fetchAllPages(buildQuery, { pageSize = 1000, maxRows = 10000 } = {}) {
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
      .select('work_order_id, employee_id, org_employees(id, name)')
      .eq('org_id', orgId)
      .in('work_order_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      const name = row.org_employees?.name
      const id = row.org_employees?.id || row.employee_id
      if (!name && !id) continue
      if (!map.has(row.work_order_id)) map.set(row.work_order_id, [])
      map.get(row.work_order_id).push({ id, name: name || '' })
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

export async function loadOrgLetterhead(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('name, email, phone, website, address_line1, address_line2, city, state, postal_code, country, logo_url')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw error
  const address = [
    data?.address_line1,
    data?.address_line2,
    [data?.city, data?.state].filter(Boolean).join(' - '),
    data?.postal_code,
    data?.country,
  ].filter((part) => String(part || '').trim()).join(', ')
  let logo = null
  if (data?.logo_url) {
    try {
      const downloaded = await supabaseAdmin.storage.from('org-assets').download(data.logo_url)
      if (!downloaded.error && downloaded.data) {
        const raw = downloaded.data
        if (Buffer.isBuffer(raw)) logo = raw
        else if (typeof raw.arrayBuffer === 'function') logo = Buffer.from(await raw.arrayBuffer())
        else logo = Buffer.from(raw)
        if (!logo.length) logo = null
      }
    } catch {
      logo = null
    }
  }
  return {
    name: data?.name || 'Organization',
    address,
    email: data?.email || '',
    phone: data?.phone || '',
    website: data?.website || '',
    logo,
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
  return data || []
}

function blankToNull(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '0' || text === 'all') return null
  return text
}

function resolveFilters(session, query = {}) {
  const defaults = defaultDateRange()
  const dateFrom = isoDate(query.date_from) || defaults.date_from
  const dateTo = isoDate(query.date_to) || defaults.date_to
  if (dateFrom > dateTo) throw httpError('date_from must be on or before date_to')
  const locationId = resolveLocationFilter(
    session,
    blankToNull(query.facility_id) || query.location_id || null,
  )
  const search = String(query.search || '').trim().toLowerCase()
  return {
    dateFrom,
    dateTo,
    locationId,
    search,
    orderType: blankToNull(query.order_type),
    orderFromId: blankToNull(query.order_from),
    orderToId: blankToNull(query.order_to),
    areaId: blankToNull(query.area_id),
    equipmentId: blankToNull(query.equipment_id),
    equipmentType: blankToNull(query.equipment_type),
    equipmentCapacity: blankToNull(query.equipment_capacity),
    equipmentTag: blankToNull(query.equipment_tag),
    priority: blankToNull(query.priority),
    status: blankToNull(query.status || query.job_status),
    jobNature: blankToNull(query.job_nature),
    createdBy: blankToNull(query.created_by),
    reportedBy: blankToNull(query.reported_by),
    assignedTo: blankToNull(query.assigned_to),
  }
}

async function loadWorkOrders(orgId, { locationId, statuses, excludeStatuses, dateFrom, dateTo } = {}) {
  return fetchAllPages(() => {
    let query = supabaseAdmin
      .from('manual_work_orders')
      .select(WO_SELECT)
      .eq('org_id', orgId)
    if (locationId) query = query.eq('assigned_location_id', locationId)
    if (statuses?.length) query = query.in('status', statuses)
    if (excludeStatuses?.length) query = query.not('status', 'in', `(${excludeStatuses.join(',')})`)
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`)
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
      assignees: (assigneeMap.get(row.id) || []).map((item) => item.name).filter(Boolean).join(', '),
      assignee_ids: (assigneeMap.get(row.id) || []).map((item) => item.id).filter(Boolean),
      pm_plan_number: planMap.get(row.pm_plan_id)?.plan_number || '',
    }
  })
}

function formatDosDontsCell(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return String(value)
  const dos = Array.isArray(value.dos)
    ? value.dos.filter(Boolean).join('; ')
    : String(value.dos || '').trim()
  const donts = Array.isArray(value.donts)
    ? value.donts.filter(Boolean).join('; ')
    : String(value.donts || '').trim()
  return [dos && `Do's: ${dos}`, donts && `Don'ts: ${donts}`].filter(Boolean).join(' | ')
}

function logRowFrom(log, workOrder, now) {
  const hours = hoursWorked(log.started_at, log.ended_at, now)
  const snap = log.field_snapshot && typeof log.field_snapshot === 'object'
    ? log.field_snapshot
    : {}
  const materialRows = Array.isArray(snap.material_rows) && snap.material_rows.length
    ? snap.material_rows
    : log.materials
  const labour = snap.labour_count != null && snap.labour_count !== ''
    ? Number(snap.labour_count) || 0
    : Number(log.labour_count) || 0
  const workDone = String(snap.work_done || log.work_done || '').trim()
  const remarks = String(
    snap.execution_remarks || snap.remarks || log.remarks || '',
  ).trim()
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
    updated_at: log.updated_at || null,
    hours,
    labour,
    materials: formatMaterialsCell(materialRows),
    work_done: workDone,
    job_description: String(snap.job_description || '').trim(),
    root_cause: String(snap.root_cause || '').trim(),
    action_taken: String(snap.action_taken || '').trim(),
    special_tools_used: String(snap.special_tools_used || '').trim(),
    safety_precautions: String(snap.safety_precautions || '').trim(),
    dos_and_donts: formatDosDontsCell(snap.dos_and_donts),
    lessons_learned: String(snap.lessons_learned || '').trim(),
    execution_remarks: String(snap.execution_remarks || '').trim(),
    remarks,
    wo_status: workOrder?.status || '',
    priority: workOrder?.priority || '',
    _material_qty: materialQtyTotal(materialRows),
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
    row.job_description,
    row.root_cause,
    row.action_taken,
    row.special_tools_used,
    row.safety_precautions,
    row.dos_and_donts,
    row.lessons_learned,
    row.execution_remarks,
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
    status_counts: tallyStatusCounts(rows, (row) => row.wo_status),
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
  const [locations, openWorkOrders, periodWorkOrders, logs, prevLogs, pmPlans] = await Promise.all([
    loadLocations(orgId, filters.locationId),
    loadWorkOrders(orgId, {
      locationId: filters.locationId,
      statuses: WO_OPEN_STATUSES,
    }),
    loadWorkOrders(orgId, {
      locationId: filters.locationId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
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

  const workOrdersById = new Map()
  for (const row of [...openWorkOrders, ...periodWorkOrders]) {
    workOrdersById.set(row.id, row)
  }
  const workOrders = [...workOrdersById.values()]
  const woById = workOrdersById
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

  const status_counts = [
    { status: 'open', count: sum('open_wos'), label: 'Open' },
    { status: 'in_progress', count: sum('in_progress'), label: 'In progress' },
    { status: 'completed', count: sum('completed'), label: 'Completed' },
    { status: 'overdue', count: sum('overdue_wos'), label: 'Overdue' },
  ]

  return { rows, kpis, status_counts, comparison_period: prev }
}

async function buildOverdueReport(orgId, filters, now) {
  const workOrders = await loadWorkOrders(orgId, {
    locationId: filters.locationId,
    statuses: WO_OPEN_STATUSES,
  })
  const overdue = workOrders.filter((row) => isWorkOrderOverdue(row, now))
  const [enriched, woStatuses] = await Promise.all([
    enrichWorkOrders(orgId, overdue),
    listOrgStatuses(orgId, 'work_order', { includeInactive: true }),
  ])

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
        progress_percent: resolveProgressPercent(row, woStatuses),
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

  return { rows, kpis, status_counts: tallyStatusCounts(rows) }
}

function equipmentFieldRole(field) {
  const name = String(field?.name || '').trim().toLowerCase()
  if (name.includes('equipment type') || name.includes('asset type')) return 'equipmentType'
  if (name.includes('equipment tag') || name.includes('asset tag')) return 'equipmentTag'
  if (name.includes('capacity')) return 'capacity'
  return null
}

function readEquipmentFieldValue(row) {
  if (!row) return ''
  if (Array.isArray(row.value_json?.values)) {
    return row.value_json.values.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
  }
  return String(row.value_text ?? '').trim()
}

function pickEquipmentRoleFields(fields) {
  const picked = { type: null, capacity: null, tag: null }
  for (const field of fields || []) {
    if (field?.kind === 'section' || field?.kind === 'child' || field?.is_active === false) continue
    const role = equipmentFieldRole(field)
    if (role === 'equipmentType' && !picked.type) picked.type = field
    if (role === 'capacity' && !picked.capacity) picked.capacity = field
    if (role === 'equipmentTag' && !picked.tag) picked.tag = field
  }
  return picked
}

async function loadEquipmentValuesByIds(orgId, equipmentIds) {
  const map = new Map()
  const unique = [...new Set((equipmentIds || []).filter(Boolean))]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabaseAdmin
      .from('equipment_values')
      .select('equipment_id, field_id, value_text, value_json')
      .eq('org_id', orgId)
      .in('equipment_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      if (!map.has(row.equipment_id)) map.set(row.equipment_id, {})
      map.get(row.equipment_id)[row.field_id] = readEquipmentFieldValue(row)
    }
  }
  return map
}

function resolveOrderType(workOrder, workRequest) {
  if (workOrder?.source_type === 'preventive_maintenance' || workOrder?.pm_plan_id) return 'scheduled'
  if (workRequest?.request_type === 'inter_department') return 'external'
  return 'internal'
}

function sameText(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
}

async function loadEquipmentCatalog(orgId, locationId) {
  const fields = await loadOrgFields(orgId)
  const roleFields = pickEquipmentRoleFields(fields)
  const rows = await fetchAllPages(() => {
    let query = supabaseAdmin
      .from('equipment')
      .select('id, name, code, location_id, department_id, area_id, is_active, areas(id, name), org_locations(id, name)')
      .eq('org_id', orgId)
      .eq('is_active', true)
    if (locationId) query = query.eq('location_id', locationId)
    return query.order('name')
  })
  const valuesByEquipment = await loadEquipmentValuesByIds(orgId, rows.map((row) => row.id))
  return rows.map((row) => {
    const values = valuesByEquipment.get(row.id) || {}
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      area_id: row.area_id || null,
      area_name: row.areas?.name || '',
      location_id: row.location_id || null,
      location_name: row.org_locations?.name || '',
      department_id: row.department_id || null,
      equipment_type: (roleFields.type && values[roleFields.type.id]) || '',
      equipment_capacity: (roleFields.capacity && values[roleFields.capacity.id]) || '',
      equipment_tag: (roleFields.tag && values[roleFields.tag.id]) || '',
    }
  })
}

function statusEntityForReportKey(reportKey) {
  if (reportKey === WORK_REQUEST_REPORT_KEY) return 'work_request'
  if (reportKey === PM_PLAN_REPORT_KEY) return 'pm_plan'
  if (reportKey === 'tasks') return 'task'
  return 'work_order'
}

export async function getReportFilterOptions(orgId, session, { reportKey } = {}) {
  const locationId = resolveLocationFilter(session, null)
  const statusEntity = statusEntityForReportKey(reportKey || UNIFIED_REPORT_KEY)
  const [locations, departmentsResult, areasResult, employeesResult, statuses, jobNatures, equipment] = await Promise.all([
    loadLocations(orgId, locationId),
    supabaseAdmin
      .from('departments')
      .select('id, name, location_id, all_locations, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabaseAdmin
      .from('areas')
      .select('id, name, location_id, department_id, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabaseAdmin
      .from('org_employees')
      .select('id, name, profile_id, location_id, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
    listOrgStatuses(orgId, statusEntity, { includeInactive: true }),
    resolveJobNatureChoiceList(orgId),
    loadEquipmentCatalog(orgId, locationId),
  ])

  if (departmentsResult.error) throw departmentsResult.error
  if (areasResult.error) throw areasResult.error
  if (employeesResult.error) throw employeesResult.error

  let departments = departmentsResult.data || []
  let areas = areasResult.data || []
  let employees = employeesResult.data || []
  if (locationId) {
    departments = departments.filter((row) => row.all_locations || row.location_id === locationId)
    areas = areas.filter((row) => row.location_id === locationId)
    employees = employees.filter((row) => row.location_id === locationId)
  }

  const createdBy = []
  const seenProfiles = new Set()
  for (const employee of employees) {
    if (!employee.profile_id || seenProfiles.has(employee.profile_id)) continue
    seenProfiles.add(employee.profile_id)
    createdBy.push({ value: employee.profile_id, label: employee.name })
  }

  return {
    report_key: reportKey || UNIFIED_REPORT_KEY,
    order_types: ORDER_TYPE_OPTIONS,
    priorities: REPORT_PRIORITY_OPTIONS,
    statuses: (statuses || []).map((row) => ({ value: row.key, label: row.name })),
    job_natures: jobNatures,
    departments: departments.map((row) => ({ value: row.id, label: row.name })),
    locations: locations.map((row) => ({ value: row.id, label: row.name })),
    areas: areas.map((row) => ({
      value: row.id,
      label: row.name,
      location_id: row.location_id,
    })),
    created_by: createdBy,
    reported_by: createdBy,
    assigned_to: employees.map((row) => ({ value: row.id, label: row.name })),
    equipment,
    can_select_location: !locationId,
    location_id: locationId,
  }
}

const WR_REPORT_SELECT = [
  'id',
  'request_number',
  'status',
  'request_type',
  'request_date',
  'created_at',
  'order_from_department_id',
  'order_to_department_id',
  'equipment_id',
  'requested_by',
  'priority',
  'short_description',
  'problem_description',
  'job_nature',
  'remarks',
  'is_breakdown',
  'execution_status',
].join(', ')

const PM_REPORT_SELECT = [
  'id',
  'plan_number',
  'name',
  'department_id',
  'location_id',
  'area_id',
  'equipment_id',
  'activity_type_id',
  'work_center',
  'priority',
  'status',
  'schedule_type',
  'start_date',
  'end_date',
  'next_due_at',
  'estimated_labour_hours',
  'contractor_vendor_id',
  'created_by',
  'created_at',
].join(', ')

async function loadWorkRequestsForReport(orgId, { locationId, dateFrom, dateTo } = {}) {
  return fetchAllPages(() => {
    let query = supabaseAdmin
      .from('work_requests')
      .select(WR_REPORT_SELECT)
      .eq('org_id', orgId)
      .neq('status', 'draft')
    if (dateFrom) query = query.gte('request_date', dateFrom)
    if (dateTo) query = query.lte('request_date', dateTo)
    return query.order('request_date', { ascending: false })
  }).then(async (rows) => {
    if (!locationId) return rows
    const deptIds = rows.flatMap((row) => [row.order_to_department_id, row.order_from_department_id])
    const eqIds = rows.map((row) => row.equipment_id)
    const [deptMap, eqMap] = await Promise.all([
      fetchByIds('departments', 'id, location_id, all_locations', deptIds),
      fetchByIds('equipment', 'id, location_id', eqIds),
    ])
    return rows.filter((row) => {
      const equipment = row.equipment_id ? eqMap.get(row.equipment_id) : null
      if (equipment?.location_id === locationId) return true
      const orderTo = row.order_to_department_id ? deptMap.get(row.order_to_department_id) : null
      if (orderTo && (orderTo.all_locations || orderTo.location_id === locationId)) return true
      const orderFrom = row.order_from_department_id ? deptMap.get(row.order_from_department_id) : null
      if (orderFrom && (orderFrom.all_locations || orderFrom.location_id === locationId)) return true
      return false
    })
  })
}

async function loadPmPlansForReport(orgId, { locationId, dateFrom, dateTo } = {}) {
  return fetchAllPages(() => {
    let query = supabaseAdmin
      .from('pm_plans')
      .select(PM_REPORT_SELECT)
      .eq('org_id', orgId)
    if (locationId) query = query.eq('location_id', locationId)
    if (dateFrom) query = query.gte('next_due_at', `${dateFrom}T00:00:00.000Z`)
    if (dateTo) query = query.lte('next_due_at', `${dateTo}T23:59:59.999Z`)
    return query.order('next_due_at', { ascending: true })
  })
}

async function loadPmTechniciansByPlan(orgId, planIds) {
  const map = new Map()
  const unique = [...new Set((planIds || []).filter(Boolean))]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabaseAdmin
      .from('pm_plan_technicians')
      .select('plan_id, employee_id, org_employees(id, name)')
      .eq('org_id', orgId)
      .in('plan_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      const name = row.org_employees?.name
      const id = row.org_employees?.id || row.employee_id
      if (!name && !id) continue
      if (!map.has(row.plan_id)) map.set(row.plan_id, [])
      map.get(row.plan_id).push({ id, name: name || '' })
    }
  }
  return map
}

async function buildWorkRequestReport(orgId, filters) {
  const requests = await loadWorkRequestsForReport(orgId, {
    locationId: filters.locationId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })
  const eqIds = requests.map((row) => row.equipment_id)
  const deptIds = requests.flatMap((row) => [row.order_from_department_id, row.order_to_department_id])
  const reporterIds = requests.map((row) => row.requested_by)

  const [eqMap, deptMap, peopleMap, fields] = await Promise.all([
    fetchByIds('equipment', 'id, name, code, location_id, area_id', eqIds),
    fetchByIds('departments', 'id, name, location_id, all_locations', deptIds),
    loadTimelineActors(orgId, reporterIds),
    loadOrgFields(orgId),
  ])

  const areaIds = [...eqMap.values()].map((row) => row.area_id)
  const locIds = [
    ...[...eqMap.values()].map((row) => row.location_id),
    ...[...deptMap.values()].map((row) => row.location_id),
  ]
  const [areaMap, locMap, valuesByEquipment] = await Promise.all([
    fetchByIds('areas', 'id, name, location_id', areaIds),
    fetchByIds('org_locations', 'id, name', locIds),
    loadEquipmentValuesByIds(orgId, [...eqMap.keys()]),
  ])
  const roleFields = pickEquipmentRoleFields(fields)

  const rows = requests.map((row) => {
    const equipment = row.equipment_id ? eqMap.get(row.equipment_id) : null
    const values = equipment ? (valuesByEquipment.get(equipment.id) || {}) : {}
    const area = equipment?.area_id ? areaMap.get(equipment.area_id) : null
    const orderTo = row.order_to_department_id ? deptMap.get(row.order_to_department_id) : null
    const orderFrom = row.order_from_department_id ? deptMap.get(row.order_from_department_id) : null
    const plantId = equipment?.location_id || area?.location_id || orderTo?.location_id || orderFrom?.location_id || null
    const plant = plantId ? locMap.get(plantId) : null
    const reporter = row.requested_by ? peopleMap.get(row.requested_by) : null

    return {
      id: row.id,
      request_number: row.request_number || '',
      request_date: String(row.request_date || row.created_at || '').slice(0, 10),
      request_type: row.request_type || '',
      status: row.status || '',
      priority: row.priority || '',
      job_nature: row.job_nature || '',
      order_from: orderFrom?.name || '',
      order_to: orderTo?.name || '',
      area: area?.name || '',
      plant: plant?.name || '',
      equipment: equipment
        ? (equipment.code ? `${equipment.code} — ${equipment.name}` : equipment.name)
        : '',
      equipment_type: (roleFields.type && values[roleFields.type.id]) || '',
      equipment_capacity: (roleFields.capacity && values[roleFields.capacity.id]) || '',
      equipment_tag: (roleFields.tag && values[roleFields.tag.id]) || '',
      reported_by: reporter?.name || reporter?.full_name || '',
      short_description: row.short_description || '',
      problem_description: row.problem_description || '',
      remarks: row.remarks || '',
      execution_status: row.execution_status || '',
      is_breakdown: row.is_breakdown ? 'Yes' : 'No',
      _order_from_id: row.order_from_department_id || null,
      _order_to_id: row.order_to_department_id || null,
      _area_id: equipment?.area_id || area?.id || null,
      _plant_id: plantId,
      _equipment_id: equipment?.id || null,
      _reported_by: row.requested_by || null,
    }
  }).filter((row) => {
    if (filters.orderFromId && row._order_from_id !== filters.orderFromId) return false
    if (filters.orderToId && row._order_to_id !== filters.orderToId) return false
    if (filters.areaId && row._area_id !== filters.areaId) return false
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.equipmentId && row._equipment_id !== filters.equipmentId) return false
    if (filters.equipmentType && !sameText(row.equipment_type, filters.equipmentType)) return false
    if (filters.equipmentCapacity && !sameText(row.equipment_capacity, filters.equipmentCapacity)) return false
    if (filters.equipmentTag && !sameText(row.equipment_tag, filters.equipmentTag)) return false
    if (filters.priority && !sameText(row.priority, filters.priority)) return false
    if (filters.status && row.status !== filters.status) return false
    if (filters.jobNature && !sameText(row.job_nature, filters.jobNature)) return false
    if (filters.reportedBy && row._reported_by !== filters.reportedBy) return false
    if (!filters.search) return true
    return [
      row.request_number,
      row.request_date,
      row.request_type,
      row.status,
      row.priority,
      row.job_nature,
      row.order_from,
      row.order_to,
      row.area,
      row.plant,
      row.equipment,
      row.reported_by,
      row.short_description,
      row.problem_description,
      row.remarks,
    ].some((value) => matchesSearch(value, filters.search))
  })

  const openStatuses = new Set(['submitted', 'pending_approval', 'need_info', 'info_provided'])
  const approved = rows.filter((row) => row.status === 'approved').length
  const converted = rows.filter((row) => row.status === 'converted').length
  const rejected = rows.filter((row) => row.status === 'rejected' || row.status === 'cancelled').length
  const open = rows.filter((row) => openStatuses.has(row.status)).length

  return {
    rows: rows.map(({
      _order_from_id,
      _order_to_id,
      _area_id,
      _plant_id,
      _equipment_id,
      _reported_by,
      ...row
    }) => row),
    kpis: [
      { key: 'total', label: 'Work requests', value: rows.length },
      { key: 'open', label: 'Open', value: open },
      { key: 'in_progress', label: 'Approved', value: approved },
      { key: 'completed', label: 'Converted', value: converted },
      { key: 'overdue', label: 'Rejected / Cancelled', value: rejected },
    ],
    status_counts: tallyStatusCounts(rows),
  }
}

async function buildPmPlanReport(orgId, filters, now) {
  const plans = await loadPmPlansForReport(orgId, {
    locationId: filters.locationId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })
  const eqIds = plans.map((row) => row.equipment_id)
  const locIds = plans.map((row) => row.location_id)
  const areaIds = plans.map((row) => row.area_id)
  const deptIds = plans.map((row) => row.department_id)
  const activityIds = plans.map((row) => row.activity_type_id)
  const vendorIds = plans.map((row) => row.contractor_vendor_id)
  const creatorIds = plans.map((row) => row.created_by)
  const planIds = plans.map((row) => row.id)

  const [eqMap, locMap, areaMap, deptMap, activityMap, vendorMap, peopleMap, techMap, fields] = await Promise.all([
    fetchByIds('equipment', 'id, name, code, location_id, area_id', eqIds),
    fetchByIds('org_locations', 'id, name', locIds),
    fetchByIds('areas', 'id, name, location_id', areaIds),
    fetchByIds('departments', 'id, name', deptIds),
    fetchByIds('pm_activity_types', 'id, name', activityIds),
    fetchByIds('vendors', 'id, name', vendorIds),
    loadTimelineActors(orgId, creatorIds),
    loadPmTechniciansByPlan(orgId, planIds),
    loadOrgFields(orgId),
  ])
  const valuesByEquipment = await loadEquipmentValuesByIds(orgId, [...eqMap.keys()])
  const roleFields = pickEquipmentRoleFields(fields)

  const rows = plans.map((row) => {
    const equipment = row.equipment_id ? eqMap.get(row.equipment_id) : null
    const values = equipment ? (valuesByEquipment.get(equipment.id) || {}) : {}
    const area = row.area_id ? areaMap.get(row.area_id) : (equipment?.area_id ? areaMap.get(equipment.area_id) : null)
    const plantId = row.location_id || equipment?.location_id || area?.location_id || null
    const plant = plantId ? locMap.get(plantId) : null
    const department = row.department_id ? deptMap.get(row.department_id) : null
    const activity = row.activity_type_id ? activityMap.get(row.activity_type_id) : null
    const contractor = row.contractor_vendor_id ? vendorMap.get(row.contractor_vendor_id) : null
    const creator = row.created_by ? peopleMap.get(row.created_by) : null
    const assignees = techMap.get(row.id) || []
    const dueAt = row.next_due_at || null
    const overdue = Boolean(
      dueAt
      && !['inactive', 'completed'].includes(String(row.status || ''))
      && new Date(dueAt) < now,
    )

    return {
      id: row.id,
      plan_number: row.plan_number || '',
      name: row.name || '',
      status: row.status || '',
      priority: row.priority || '',
      schedule_type: row.schedule_type || '',
      activity_type: activity?.name || '',
      area: area?.name || '',
      plant: plant?.name || '',
      department: department?.name || '',
      equipment: equipment
        ? (equipment.code ? `${equipment.code} — ${equipment.name}` : equipment.name)
        : '',
      equipment_type: (roleFields.type && values[roleFields.type.id]) || '',
      equipment_capacity: (roleFields.capacity && values[roleFields.capacity.id]) || '',
      equipment_tag: (roleFields.tag && values[roleFields.tag.id]) || '',
      work_center: row.work_center || '',
      next_due_at: dueAt || '',
      start_date: row.start_date || '',
      end_date: row.end_date || '',
      assignees: assignees.map((item) => item.name).filter(Boolean).join(', '),
      created_by: creator?.name || creator?.full_name || '',
      estimated_labour_hours: row.estimated_labour_hours ?? '',
      contractor: contractor?.name || '',
      _area_id: row.area_id || equipment?.area_id || area?.id || null,
      _plant_id: plantId,
      _equipment_id: equipment?.id || null,
      _created_by: row.created_by || null,
      _assignee_ids: assignees.map((item) => item.id).filter(Boolean),
      _overdue: overdue,
    }
  }).filter((row) => {
    if (filters.areaId && row._area_id !== filters.areaId) return false
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.equipmentId && row._equipment_id !== filters.equipmentId) return false
    if (filters.equipmentType && !sameText(row.equipment_type, filters.equipmentType)) return false
    if (filters.equipmentCapacity && !sameText(row.equipment_capacity, filters.equipmentCapacity)) return false
    if (filters.equipmentTag && !sameText(row.equipment_tag, filters.equipmentTag)) return false
    if (filters.priority && !sameText(row.priority, filters.priority)) return false
    if (filters.status && row.status !== filters.status) return false
    if (filters.createdBy && row._created_by !== filters.createdBy) return false
    if (filters.assignedTo && !row._assignee_ids.includes(filters.assignedTo)) return false
    if (!filters.search) return true
    return [
      row.plan_number,
      row.name,
      row.status,
      row.priority,
      row.schedule_type,
      row.activity_type,
      row.area,
      row.plant,
      row.department,
      row.equipment,
      row.assignees,
      row.created_by,
      row.contractor,
    ].some((value) => matchesSearch(value, filters.search))
  })

  const active = rows.filter((row) => row.status === 'active').length
  const overdue = rows.filter((row) => row._overdue || row.status === 'overdue').length
  const inactive = rows.filter((row) => row.status === 'inactive').length

  return {
    rows: rows.map(({
      _area_id,
      _plant_id,
      _equipment_id,
      _created_by,
      _assignee_ids,
      _overdue,
      ...row
    }) => row),
    kpis: [
      { key: 'total', label: 'PM plans', value: rows.length },
      { key: 'open', label: 'Active', value: active },
      { key: 'overdue', label: 'Overdue', value: overdue },
      { key: 'completed', label: 'Inactive', value: inactive },
    ],
    status_counts: tallyStatusCounts(rows),
  }
}

async function buildUnifiedReport(orgId, filters, now) {
  const workOrders = await loadWorkOrders(orgId, {
    locationId: filters.locationId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })
  const wrIds = workOrders.map((row) => row.work_request_id)
  const eqIds = workOrders.map((row) => row.equipment_id)
  const locIds = workOrders.map((row) => row.assigned_location_id)
  const deptIds = workOrders.map((row) => row.assigned_department_id)
  const creatorIds = workOrders.map((row) => row.created_by)
  const requesterIds = workOrders.map((row) => row.requester_id)
  const woIds = workOrders.map((row) => row.id)

  const wrMap = await fetchByIds(
    'work_requests',
    'id, request_type, request_number, order_from_department_id, order_to_department_id, requested_by, job_nature, equipment_id, short_description, problem_description, remarks',
    wrIds,
  )
  const wrDeptIds = [...wrMap.values()].flatMap((row) => [
    row.order_from_department_id,
    row.order_to_department_id,
  ])
  const wrRequesterIds = [...wrMap.values()].map((row) => row.requested_by)

  const [eqMap, locMap, deptMap, assigneeMap, fields, peopleMap, logs, woStatuses] = await Promise.all([
    fetchByIds('equipment', 'id, name, code, location_id, area_id, department_id', [
      ...eqIds,
      ...[...wrMap.values()].map((row) => row.equipment_id),
    ]),
    fetchByIds('org_locations', 'id, name', locIds),
    fetchByIds('departments', 'id, name', [...deptIds, ...wrDeptIds]),
    loadAssigneesByWorkOrder(orgId, woIds),
    loadOrgFields(orgId),
    loadTimelineActors(orgId, [...creatorIds, ...requesterIds, ...wrRequesterIds]),
    loadDailyLogs(orgId, { dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    listOrgStatuses(orgId, 'work_order', { includeInactive: true }),
  ])

  const logsByWo = new Map()
  for (const log of logs) {
    if (!log.work_order_id) continue
    if (!logsByWo.has(log.work_order_id)) logsByWo.set(log.work_order_id, [])
    logsByWo.get(log.work_order_id).push(log)
  }

  const areaIds = [...eqMap.values()].map((row) => row.area_id)
  const extraLocIds = [...eqMap.values()].map((row) => row.location_id).filter((id) => id && !locMap.has(id))
  const [areaMap, extraLocMap, valuesByEquipment] = await Promise.all([
    fetchByIds('areas', 'id, name, location_id', areaIds),
    extraLocIds.length ? fetchByIds('org_locations', 'id, name', extraLocIds) : Promise.resolve(new Map()),
    loadEquipmentValuesByIds(orgId, [...eqMap.keys()]),
  ])
  for (const [id, row] of extraLocMap) locMap.set(id, row)

  const roleFields = pickEquipmentRoleFields(fields)

  const rows = workOrders.map((row) => {
    const workRequest = row.work_request_id ? wrMap.get(row.work_request_id) : null
    const equipment = eqMap.get(row.equipment_id) || (workRequest?.equipment_id ? eqMap.get(workRequest.equipment_id) : null)
    const values = equipment ? (valuesByEquipment.get(equipment.id) || {}) : {}
    const area = equipment?.area_id ? areaMap.get(equipment.area_id) : null
    const plantId = row.assigned_location_id || equipment?.location_id || area?.location_id || null
    const plant = plantId ? locMap.get(plantId) : null
    const orderFromId = workRequest?.order_from_department_id || null
    const orderToId = workRequest?.order_to_department_id || row.assigned_department_id || null
    const assignees = assigneeMap.get(row.id) || []
    const creator = row.created_by ? peopleMap.get(row.created_by) : null
    const reporterId = workRequest?.requested_by || row.requester_id || null
    const reporter = reporterId ? peopleMap.get(reporterId) : null
    const orderType = resolveOrderType(row, workRequest)
    const shortDescription = workRequest?.short_description
      || row.short_description
      || row.problem_description
      || ''
    const woLogs = logsByWo.get(row.id) || []
    const formMaterials = parseMaterialList(row.material_consumed)
    const logMaterials = rollupMaterialsFromLogs(woLogs)
    const materialConsumed = formatMaterialsCell(formMaterials.length ? formMaterials : logMaterials)
    const workDone = woLogs
      .map((log) => String(log.work_done || '').trim())
      .filter(Boolean)
      .join('\n')
    const assignedDept = row.assigned_department_id
      ? deptMap.get(row.assigned_department_id)
      : null

    return {
      id: row.id,
      wo_number: displayWorkOrderNumber(row),
      request_number: workRequest?.request_number || '',
      log_date: String(row.created_at || '').slice(0, 10),
      source: SOURCE_LABELS[row.source_type] || row.source_type || '',
      order_type: orderType,
      order_from: orderFromId ? (deptMap.get(orderFromId)?.name || '') : '',
      order_to: orderToId ? (deptMap.get(orderToId)?.name || '') : '',
      area: area?.name || '',
      plant: plant?.name || '',
      equipment: equipment
        ? (equipment.code ? `${equipment.code} — ${equipment.name}` : equipment.name)
        : '',
      equipment_type: (roleFields.type && values[roleFields.type.id]) || '',
      equipment_capacity: (roleFields.capacity && values[roleFields.capacity.id]) || '',
      equipment_tag: (roleFields.tag && values[roleFields.tag.id]) || '',
      job_nature: workRequest?.job_nature || '',
      priority: row.priority || '',
      status: row.status || '',
      progress_percent: resolveProgressPercent(row, woStatuses),
      work_center: row.work_center || '',
      department: assignedDept?.name || '',
      created_by: creator?.name || creator?.full_name || '',
      reported_by: reporter?.name || reporter?.full_name || '',
      assignees: assignees.map((item) => item.name).filter(Boolean).join(', '),
      short_description: shortDescription,
      problem_description: workRequest?.problem_description || row.problem_description || '',
      remarks: workRequest?.remarks || '',
      planned_start_at: row.planned_start_at || '',
      planned_end_at: row.planned_end_at || '',
      due_at: workOrderDueAt(row) || '',
      work_start_at: row.work_start_at || '',
      work_end_at: row.work_end_at || '',
      labour_count: row.labour_count ?? '',
      vendor_expense: row.vendor_expense ?? '',
      breakdown_start_at: row.breakdown_start_at || '',
      breakdown_end_at: row.breakdown_end_at || '',
      breakdown_duration_hours: row.breakdown_duration_hours ?? '',
      permit_required: row.permit_required ? 'Yes' : (row.permit_required === false ? 'No' : ''),
      permit_type: formatPermitType(row),
      permit_number: permitField(row, 'number'),
      permit_issue_at: permitField(row, 'issue_at'),
      permit_expiry_at: permitField(row, 'expiry_at'),
      work_done: workDone,
      job_description: row.job_description || '',
      root_cause: row.root_cause || '',
      action_taken: row.action_taken || '',
      material_consumed: materialConsumed,
      special_tools_used: row.special_tools_used || '',
      safety_precautions: row.safety_precautions || '',
      dos_and_donts: formatDosDonts(row.dos_and_donts),
      lessons_learned: row.lessons_learned || '',
      execution_remarks: row.execution_remarks || '',
      _order_from_id: orderFromId,
      _order_to_id: orderToId,
      _area_id: equipment?.area_id || area?.id || null,
      _plant_id: plantId,
      _equipment_id: equipment?.id || null,
      _created_by: row.created_by || null,
      _reported_by: reporterId,
      _assignee_ids: assignees.map((item) => item.id).filter(Boolean),
      _overdue: isWorkOrderOverdue(row, now),
    }
  }).filter((row) => {
    if (filters.orderType && row.order_type !== filters.orderType) return false
    if (filters.orderFromId && row._order_from_id !== filters.orderFromId) return false
    if (filters.orderToId && row._order_to_id !== filters.orderToId) return false
    if (filters.areaId && row._area_id !== filters.areaId) return false
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.equipmentId && row._equipment_id !== filters.equipmentId) return false
    if (filters.equipmentType && !sameText(row.equipment_type, filters.equipmentType)) return false
    if (filters.equipmentCapacity && !sameText(row.equipment_capacity, filters.equipmentCapacity)) return false
    if (filters.equipmentTag && !sameText(row.equipment_tag, filters.equipmentTag)) return false
    if (filters.priority && !sameText(row.priority, filters.priority)) return false
    if (filters.status && row.status !== filters.status) return false
    if (filters.jobNature && !sameText(row.job_nature, filters.jobNature)) return false
    if (filters.createdBy && row._created_by !== filters.createdBy) return false
    if (filters.reportedBy && row._reported_by !== filters.reportedBy) return false
    if (filters.assignedTo && !row._assignee_ids.includes(filters.assignedTo)) return false
    if (!filters.search) return true
    return [
      row.wo_number,
      row.log_date,
      row.order_type,
      row.order_from,
      row.order_to,
      row.area,
      row.plant,
      row.equipment,
      row.equipment_type,
      row.equipment_capacity,
      row.equipment_tag,
      row.priority,
      row.status,
      row.job_nature,
      row.created_by,
      row.reported_by,
      row.assignees,
      row.short_description,
      row.problem_description,
      row.remarks,
      row.request_number,
      row.source,
      row.work_center,
      row.department,
      row.job_description,
      row.root_cause,
      row.action_taken,
      row.material_consumed,
      row.work_done,
      row.execution_remarks,
    ].some((value) => matchesSearch(value, filters.search))
  })

  const open = rows.filter((row) => WO_OPEN_STATUSES.includes(row.status)).length
  const inProgress = rows.filter((row) => WO_IN_PROGRESS_STATUSES.includes(row.status)).length
  const completed = rows.filter((row) => WO_TERMINAL_STATUSES.includes(row.status)).length
  const overdue = rows.filter((row) => row._overdue).length

  const kpis = [
    { key: 'total', label: 'Work orders', value: rows.length },
    { key: 'open', label: 'Open', value: open },
    { key: 'in_progress', label: 'In progress', value: inProgress },
    { key: 'completed', label: 'Completed', value: completed },
    { key: 'overdue', label: 'Overdue', value: overdue },
  ]

  return {
    rows: rows.map(({
      _order_from_id,
      _order_to_id,
      _area_id,
      _plant_id,
      _equipment_id,
      _created_by,
      _reported_by,
      _assignee_ids,
      _overdue,
      ...row
    }) => row),
    kpis,
    status_counts: tallyStatusCounts(rows),
  }
}

async function buildMeterReadingReport(orgId, filters) {
  const readings = await fetchAllPages(() => {
    let query = supabaseAdmin
      .from('equipment_meter_readings')
      .select('id, equipment_id, reading, reading_at, logged_by, logged_by_name, logged_by_department, logged_by_designation, created_at')
      .eq('org_id', orgId)
    if (filters.dateFrom) query = query.gte('reading_at', `${filters.dateFrom}T00:00:00.000Z`)
    if (filters.dateTo) query = query.lte('reading_at', `${filters.dateTo}T23:59:59.999Z`)
    return query.order('reading_at', { ascending: false })
  })

  const eqIds = readings.map((row) => row.equipment_id)
  const eqMap = await fetchByIds('equipment', 'id, name, code, location_id, area_id, department_id', eqIds)
  const areaIds = [...eqMap.values()].map((row) => row.area_id)
  const locIds = [...eqMap.values()].map((row) => row.location_id)
  const [areaMap, locMap] = await Promise.all([
    fetchByIds('areas', 'id, name, location_id', areaIds),
    fetchByIds('org_locations', 'id, name', locIds),
  ])

  const rows = readings.map((row) => {
    const equipment = row.equipment_id ? eqMap.get(row.equipment_id) : null
    const area = equipment?.area_id ? areaMap.get(equipment.area_id) : null
    const plantId = equipment?.location_id || area?.location_id || null
    const plant = plantId ? locMap.get(plantId) : null
    return {
      id: row.id,
      reading_at: row.reading_at || '',
      reading: row.reading ?? '',
      equipment: equipment?.name || '',
      equipment_code: equipment?.code || '',
      area: area?.name || '',
      plant: plant?.name || '',
      logged_by: row.logged_by_name || '',
      logged_by_department: row.logged_by_department || '',
      logged_by_designation: row.logged_by_designation || '',
      _plant_id: plantId,
      _area_id: equipment?.area_id || area?.id || null,
      _equipment_id: equipment?.id || null,
      _created_by: row.logged_by || null,
    }
  }).filter((row) => {
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.areaId && row._area_id !== filters.areaId) return false
    if (filters.equipmentId && row._equipment_id !== filters.equipmentId) return false
    if (filters.createdBy && row._created_by !== filters.createdBy) return false
    if (!filters.search) return true
    return [
      row.equipment,
      row.equipment_code,
      row.area,
      row.plant,
      row.logged_by,
      row.reading,
    ].some((value) => matchesSearch(value, filters.search))
  })

  const assetCount = new Set(rows.map((row) => row._equipment_id).filter(Boolean)).size
  return {
    rows: rows.map(({ _plant_id, _area_id, _equipment_id, _created_by, ...row }) => row),
    kpis: [
      { key: 'total', label: 'Readings', value: rows.length },
      { key: 'open', label: 'Assets', value: assetCount },
    ],
  }
}

async function buildTaskReport(orgId, filters) {
  const tasks = await fetchAllPages(() => {
    let query = supabaseAdmin
      .from('tasks')
      .select(`
        id, task_number, title, short_description, task_type, status_id, priority_id, category_id,
        vendor_id, start_date, due_date, department_id, location_id, created_by_profile_id, created_at,
        status:status_id (id, name),
        priority:priority_id (id, name),
        category:category_id (id, name),
        vendor:vendor_id (id, name),
        department:department_id (id, name),
        location:location_id (id, name),
        creator:created_by_profile_id (id, full_name),
        task_assignees (employee_id, employee:employee_id (id, name))
      `)
      .eq('org_id', orgId)
      .eq('is_recurrence_template', false)
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`)
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`)
    if (filters.locationId) query = query.eq('location_id', filters.locationId)
    return query.order('created_at', { ascending: false })
  })

  const rows = tasks.map((row) => {
    const assignees = (row.task_assignees || [])
      .map((item) => item.employee?.name || '')
      .filter(Boolean)
    const assigneeIds = (row.task_assignees || []).map((item) => item.employee_id).filter(Boolean)
    return {
      id: row.id,
      task_number: row.task_number || '',
      title: row.title || '',
      status: row.status?.name || '',
      priority: row.priority?.name || '',
      category: row.category?.name || '',
      task_type: row.task_type || '',
      plant: row.location?.name || '',
      department: row.department?.name || '',
      assignees: assignees.join(', '),
      due_date: row.due_date || '',
      start_date: row.start_date || '',
      created_by: row.creator?.full_name || '',
      short_description: row.short_description || '',
      vendor: row.vendor?.name || '',
      _plant_id: row.location_id || null,
      _created_by: row.created_by_profile_id || null,
      _assignee_ids: assigneeIds,
      _status_id: row.status_id || null,
      _priority_name: row.priority?.name || '',
    }
  }).filter((row) => {
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.createdBy && row._created_by !== filters.createdBy) return false
    if (filters.assignedTo && !row._assignee_ids.includes(filters.assignedTo)) return false
    if (filters.priority && !sameText(row._priority_name, filters.priority) && !sameText(row.priority, filters.priority)) return false
    if (filters.status && row._status_id !== filters.status && !sameText(row.status, filters.status)) return false
    if (!filters.search) return true
    return [
      row.task_number,
      row.title,
      row.status,
      row.priority,
      row.category,
      row.plant,
      row.department,
      row.assignees,
      row.short_description,
      row.vendor,
    ].some((value) => matchesSearch(value, filters.search))
  })

  return {
    rows: rows.map(({ _plant_id, _created_by, _assignee_ids, _status_id, _priority_name, ...row }) => row),
    kpis: [
      { key: 'total', label: 'Tasks', value: rows.length },
      { key: 'open', label: 'With due date', value: rows.filter((row) => row.due_date).length },
      { key: 'completed', label: 'Assigned', value: rows.filter((row) => row.assignees).length },
    ],
  }
}

async function buildWarrantyReport(orgId, filters, now) {
  const warranties = await fetchAllPages(() => {
    let query = supabaseAdmin
      .from('warranties')
      .select('id, serial_number, make, vendor, purchase_date, warranty_start, warranty_end, warranty_period_months, po_number, invoice_number, contact_name, contact_phone, contact_email, created_at')
      .eq('org_id', orgId)
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`)
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`)
    return query.order('created_at', { ascending: false })
  })

  const rows = warranties.map((row) => {
    const end = row.warranty_end ? new Date(row.warranty_end) : null
    let status = 'Active'
    if (end && !Number.isNaN(end.getTime())) {
      status = end < now ? 'Expired' : 'Active'
    }
    return {
      id: row.id,
      serial_number: row.serial_number || '',
      make: row.make || '',
      vendor: row.vendor || '',
      purchase_date: row.purchase_date || '',
      warranty_start: row.warranty_start || '',
      warranty_end: row.warranty_end || '',
      warranty_period_months: row.warranty_period_months ?? '',
      po_number: row.po_number || '',
      invoice_number: row.invoice_number || '',
      contact_name: row.contact_name || '',
      contact_phone: row.contact_phone || '',
      contact_email: row.contact_email || '',
      status,
    }
  }).filter((row) => {
    if (filters.status && !sameText(row.status, filters.status)) return false
    if (!filters.search) return true
    return [
      row.serial_number,
      row.make,
      row.vendor,
      row.po_number,
      row.invoice_number,
      row.contact_name,
      row.status,
    ].some((value) => matchesSearch(value, filters.search))
  })

  return {
    rows,
    kpis: [
      { key: 'total', label: 'Warranties', value: rows.length },
      { key: 'open', label: 'Active', value: rows.filter((row) => row.status === 'Active').length },
      { key: 'overdue', label: 'Expired', value: rows.filter((row) => row.status === 'Expired').length },
    ],
  }
}

async function buildEquipmentReport(orgId, filters) {
  const assets = await fetchAllPages(() => {
    let query = supabaseAdmin
      .from('equipment')
      .select('id, name, code, location_id, area_id, department_id, reading_required, last_meter_reading, last_meter_reading_at, is_active, created_at')
      .eq('org_id', orgId)
    if (filters.locationId) query = query.eq('location_id', filters.locationId)
    if (filters.areaId) query = query.eq('area_id', filters.areaId)
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`)
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`)
    return query.order('name', { ascending: true })
  })

  const locIds = assets.map((row) => row.location_id)
  const areaIds = assets.map((row) => row.area_id)
  const deptIds = assets.map((row) => row.department_id)
  const [locMap, areaMap, deptMap, fields, valuesByEquipment] = await Promise.all([
    fetchByIds('org_locations', 'id, name', locIds),
    fetchByIds('areas', 'id, name', areaIds),
    fetchByIds('departments', 'id, name', deptIds),
    loadOrgFields(orgId),
    loadEquipmentValuesByIds(orgId, assets.map((row) => row.id)),
  ])
  const roleFields = pickEquipmentRoleFields(fields)

  const rows = assets.map((row) => {
    const values = valuesByEquipment.get(row.id) || {}
    return {
      id: row.id,
      code: row.code || '',
      name: row.name || '',
      area: row.area_id ? (areaMap.get(row.area_id)?.name || '') : '',
      plant: row.location_id ? (locMap.get(row.location_id)?.name || '') : '',
      department: row.department_id ? (deptMap.get(row.department_id)?.name || '') : '',
      equipment_type: (roleFields.type && values[roleFields.type.id]) || '',
      equipment_capacity: (roleFields.capacity && values[roleFields.capacity.id]) || '',
      equipment_tag: (roleFields.tag && values[roleFields.tag.id]) || '',
      reading_required: row.reading_required ? 'Yes' : 'No',
      last_meter_reading: row.last_meter_reading ?? '',
      last_meter_reading_at: row.last_meter_reading_at || '',
      is_active: row.is_active === false ? 'No' : 'Yes',
      created_at: row.created_at || '',
      _plant_id: row.location_id || null,
      _area_id: row.area_id || null,
      _equipment_id: row.id,
    }
  }).filter((row) => {
    if (filters.locationId && row._plant_id !== filters.locationId) return false
    if (filters.areaId && row._area_id !== filters.areaId) return false
    if (filters.equipmentId && row._equipment_id !== filters.equipmentId) return false
    if (filters.equipmentType && !sameText(row.equipment_type, filters.equipmentType)) return false
    if (filters.equipmentCapacity && !sameText(row.equipment_capacity, filters.equipmentCapacity)) return false
    if (filters.equipmentTag && !sameText(row.equipment_tag, filters.equipmentTag)) return false
    if (!filters.search) return true
    return [
      row.code,
      row.name,
      row.area,
      row.plant,
      row.department,
      row.equipment_type,
      row.equipment_tag,
    ].some((value) => matchesSearch(value, filters.search))
  })

  return {
    rows: rows.map(({ _plant_id, _area_id, _equipment_id, ...row }) => row),
    kpis: [
      { key: 'total', label: 'Assets', value: rows.length },
      { key: 'open', label: 'Meter required', value: rows.filter((row) => row.reading_required === 'Yes').length },
      { key: 'completed', label: 'Active', value: rows.filter((row) => row.is_active === 'Yes').length },
    ],
  }
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
  } else if (catalog.kind === 'unified') {
    payload = await buildUnifiedReport(orgId, filters, now)
  } else if (catalog.kind === 'work_request') {
    payload = await buildWorkRequestReport(orgId, filters)
  } else if (catalog.kind === 'pm_plan') {
    payload = await buildPmPlanReport(orgId, filters, now)
  } else if (catalog.kind === 'meter_reading') {
    payload = await buildMeterReadingReport(orgId, filters)
  } else if (catalog.kind === 'task') {
    payload = await buildTaskReport(orgId, filters)
  } else if (catalog.kind === 'warranty') {
    payload = await buildWarrantyReport(orgId, filters, now)
  } else if (catalog.kind === 'equipment') {
    payload = await buildEquipmentReport(orgId, filters)
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
    status_counts: payload.status_counts || [],
    comparison_period: payload.comparison_period || null,
    total: payload.rows.length,
  }
}
