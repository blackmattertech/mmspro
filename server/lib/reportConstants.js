export const UNIFIED_REPORT_KEY = 'logs'

export const ORDER_TYPE_OPTIONS = [
  { value: 'external', label: 'External' },
  { value: 'internal', label: 'Internal' },
  { value: 'scheduled', label: 'Scheduled' },
]

export const REPORT_PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const REPORT_CATALOG = {
  logs: {
    key: UNIFIED_REPORT_KEY,
    moduleKey: 'reports',
    title: 'Reports',
    kind: 'unified',
    dayStatus: null,
    about: 'Work orders in the selected period, filtered by order, asset, job, and user fields.',
    rowMeaning: 'Each row is one work order.',
  },
  'daily-logs': {
    key: 'daily-logs',
    moduleKey: 'reports_daily_logs',
    title: 'Daily Logs',
    kind: 'logs',
    dayStatus: null,
    about: 'A day-by-day record of maintenance work in the selected period — what was done, where, by whom, and for how long.',
    rowMeaning: 'Each row is one daily log on a work order.',
  },
  'open-logs': {
    key: 'open-logs',
    moduleKey: 'reports_open_logs',
    title: 'Open Logs',
    kind: 'logs',
    dayStatus: 'open',
    about: 'Daily logs that are still open (the day is not closed). Use this to see work that is in progress or waiting to be closed.',
    rowMeaning: 'Each row is an open daily log on a work order.',
  },
  'completed-logs': {
    key: 'completed-logs',
    moduleKey: 'reports_completed_logs',
    title: 'Completed Logs',
    kind: 'logs',
    dayStatus: 'closed',
    about: 'Daily logs that have been closed in the selected period. Use this to review finished days of work, hours, labour, and materials.',
    rowMeaning: 'Each row is a closed daily log on a work order.',
  },
  'plant-wise': {
    key: 'plant-wise',
    moduleKey: 'reports_plant_wise',
    title: 'Plant Wise Report',
    kind: 'plant',
    dayStatus: null,
    about: 'A plant-level snapshot of open, in-progress, completed, and overdue work, plus logs, labour, materials, and overdue PM.',
    rowMeaning: 'Each row is one plant, with totals for the selected period.',
  },
  overdue: {
    key: 'overdue',
    moduleKey: 'reports_overdue',
    title: 'Overdue Workorders',
    kind: 'overdue',
    dayStatus: null,
    about: 'Work orders that are past their due date. Sorted by aging so the oldest overdue jobs are easiest to spot.',
    rowMeaning: 'Each row is one overdue work order.',
  },
}

export const REPORT_KEYS = Object.keys(REPORT_CATALOG)

export const WO_TERMINAL_STATUSES = ['completed', 'verified', 'closed']

export const WO_OPEN_STATUSES = [
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'returned_rework',
]

export const WO_IN_PROGRESS_STATUSES = [
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
]

export const LOG_COLUMNS = [
  { id: 'log_date', label: 'Date' },
  { id: 'day_status', label: 'Day status' },
  { id: 'wo_number', label: 'WO #' },
  { id: 'short_description', label: 'Short description' },
  { id: 'plant', label: 'Plant' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'started_at', label: 'Started' },
  { id: 'ended_at', label: 'Ended' },
  { id: 'hours', label: 'Hours' },
  { id: 'labour', label: 'Labour' },
  { id: 'materials', label: 'Materials' },
  { id: 'work_done', label: 'Work done' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'wo_status', label: 'WO status' },
  { id: 'priority', label: 'Priority' },
]

export const PLANT_COLUMNS = [
  { id: 'plant', label: 'Plant' },
  { id: 'open_wos', label: 'Open WOs' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue_wos', label: 'Overdue WOs' },
  { id: 'breakdown_hours', label: 'Breakdown hours' },
  { id: 'open_logs', label: 'Open logs' },
  { id: 'closed_logs', label: 'Closed logs' },
  { id: 'labour', label: 'Labour' },
  { id: 'material_lines', label: 'Material lines' },
  { id: 'pm_overdue', label: 'PM overdue' },
]

export const UNIFIED_COLUMNS = [
  { id: 'wo_number', label: 'WO #' },
  { id: 'request_number', label: 'Request #' },
  { id: 'log_date', label: 'Date' },
  { id: 'source', label: 'Source' },
  { id: 'order_type', label: 'Order Type' },
  { id: 'order_from', label: 'Order From' },
  { id: 'order_to', label: 'Order To' },
  { id: 'area', label: 'Area' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'equipment_type', label: 'Equipment Type' },
  { id: 'equipment_capacity', label: 'Equipment Capacity' },
  { id: 'equipment_tag', label: 'Equipment Tag' },
  { id: 'job_nature', label: 'Job Nature' },
  { id: 'priority', label: 'Job Priority' },
  { id: 'status', label: 'Job Status' },
  { id: 'progress_percent', label: 'Progress %' },
  { id: 'work_center', label: 'Work Center' },
  { id: 'department', label: 'Department' },
  { id: 'created_by', label: 'Created By' },
  { id: 'reported_by', label: 'Reported By' },
  { id: 'assignees', label: 'Assigned To' },
  { id: 'short_description', label: 'Short description' },
  { id: 'problem_description', label: 'Problem description' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'planned_start_at', label: 'Planned start' },
  { id: 'planned_end_at', label: 'Planned end' },
  { id: 'due_at', label: 'Due date' },
  { id: 'work_start_at', label: 'Work start' },
  { id: 'work_end_at', label: 'Work end' },
  { id: 'labour_count', label: 'Labour count' },
  { id: 'vendor_expense', label: 'Vendor expense' },
  { id: 'breakdown_start_at', label: 'Breakdown start' },
  { id: 'breakdown_end_at', label: 'Breakdown end' },
  { id: 'breakdown_duration_hours', label: 'Breakdown hours' },
  { id: 'permit_required', label: 'Permit required' },
  { id: 'permit_type', label: 'Permit type' },
  { id: 'permit_number', label: 'Permit number' },
  { id: 'permit_issue_at', label: 'Permit date' },
  { id: 'permit_expiry_at', label: 'Permit expiry' },
  { id: 'work_done', label: 'Work done' },
  { id: 'job_description', label: 'Detailed job description' },
  { id: 'root_cause', label: 'Root cause analysis' },
  { id: 'action_taken', label: 'Action taken' },
  { id: 'material_consumed', label: 'Material consumed' },
  { id: 'special_tools_used', label: 'Special tools used' },
  { id: 'safety_precautions', label: 'Safety precautions' },
  { id: 'dos_and_donts', label: "Do's and don'ts" },
  { id: 'lessons_learned', label: 'Lessons learned' },
  { id: 'execution_remarks', label: 'Execution remarks' },
]

export const OVERDUE_COLUMNS = [
  { id: 'wo_number', label: 'WO #' },
  { id: 'short_description', label: 'Short description' },
  { id: 'plant', label: 'Plant' },
  { id: 'department', label: 'Department' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'progress_percent', label: 'Progress %' },
  { id: 'source', label: 'Source' },
  { id: 'due_at', label: 'Due date' },
  { id: 'aging_days', label: 'Aging days' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'pm_plan_number', label: 'PM plan #' },
]

export const DATE_WINDOWS = ['previous_day', 'last_7_days', 'last_30_days', 'month_to_date']
export const SCHEDULE_FREQUENCIES = [
  'daily',
  'twice_daily',
  'every_2_days',
  'every_3_days',
  'weekly',
  'twice_weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
]

export const WEEKDAY_FREQUENCIES = ['weekly', 'biweekly']
export const MONTH_DAY_FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'yearly']
export const MONTH_STEPS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
}
export const DAY_INTERVALS = {
  daily: 1,
  every_2_days: 2,
  every_3_days: 3,
}

export function getReportCatalog(key) {
  return REPORT_CATALOG[key] || null
}

export function columnsForReport(kind) {
  if (kind === 'plant') return PLANT_COLUMNS
  if (kind === 'overdue') return OVERDUE_COLUMNS
  if (kind === 'unified') return UNIFIED_COLUMNS
  return LOG_COLUMNS
}

export function filterReportColumns(kind, requested) {
  const allowed = new Set(columnsForReport(kind).map((col) => col.id))
  const seen = new Set()
  const list = []
  for (const raw of Array.isArray(requested) ? requested : []) {
    const id = String(raw || '').trim()
    if (!id || !allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    list.push(id)
  }
  return list
}

export function isMissingReportTable(error) {
  const code = error?.code
  const message = error?.message || ''
  return (
    code === '42P01'
    || code === 'PGRST205'
    || /report_custom_reports|report_schedules/i.test(message)
  )
}

export function isoDate(value) {
  if (!value) return null
  const text = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export function addUtcDays(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function defaultDateRange(now = new Date()) {
  const to = now.toISOString().slice(0, 10)
  return { date_from: addUtcDays(to, -29), date_to: to }
}

export function previousEqualRange(dateFrom, dateTo) {
  const from = isoDate(dateFrom)
  const to = isoDate(dateTo)
  if (!from || !to) return null
  const start = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  const days = Math.round((end - start) / 86400000) + 1
  if (days < 1) return null
  const prevTo = addUtcDays(from, -1)
  const prevFrom = addUtcDays(prevTo, -(days - 1))
  return { date_from: prevFrom, date_to: prevTo }
}

export function resolveDateWindow(windowKey, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const to = today.toISOString().slice(0, 10)
  switch (windowKey) {
    case 'previous_day': {
      const from = addUtcDays(to, -1)
      return { date_from: from, date_to: from }
    }
    case 'last_7_days':
      return { date_from: addUtcDays(to, -6), date_to: to }
    case 'month_to_date': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
      return { date_from: from, date_to: to }
    }
    case 'last_30_days':
    default:
      return { date_from: addUtcDays(to, -29), date_to: to }
  }
}

export function hoursWorked(startedAt, endedAt, now = new Date()) {
  if (!startedAt) return 0
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : now
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.round(((end.getTime() - start.getTime()) / 3600000) * 10) / 10
}

export function workOrderDueAt(row) {
  return row?.planned_end_at || row?.scheduled_at || row?.planned_start_at || null
}

export function isWorkOrderOverdue(row, now = new Date()) {
  if (!row) return false
  if (WO_TERMINAL_STATUSES.includes(String(row.status || ''))) return false
  const due = workOrderDueAt(row)
  if (!due) return false
  const dueDate = new Date(due)
  if (Number.isNaN(dueDate.getTime())) return false
  return dueDate < now
}

export function agingDays(dueAt, now = new Date()) {
  const due = dueAt ? new Date(dueAt) : null
  if (!due || Number.isNaN(due.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000))
}

export function formatStatusLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export function formatReportValue(columnId, value) {
  if (value == null || value === '') return ''
  if (columnId === 'progress_percent') {
    const n = Number(value)
    return Number.isFinite(n) ? `${n}%` : String(value)
  }
  if (columnId === 'hours' || columnId === 'breakdown_hours') {
    const n = Number(value)
    return Number.isFinite(n) ? String(n) : String(value)
  }
  if (columnId === 'log_date') {
    return String(value).slice(0, 10)
  }
  if ([
    'started_at',
    'ended_at',
    'due_at',
    'generated_at',
    'work_start_at',
    'work_end_at',
    'planned_start_at',
    'planned_end_at',
    'breakdown_start_at',
    'breakdown_end_at',
    'permit_issue_at',
    'permit_expiry_at',
  ].includes(columnId)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toISOString().replace('T', ' ').slice(0, 16)
  }
  if (['day_status', 'wo_status', 'status', 'priority', 'source', 'order_type', 'source_type'].includes(columnId)) {
    return formatStatusLabel(value)
  }
  if (columnId === 'permit_required') {
    if (value === true || value === 'yes' || value === 'true') return 'Yes'
    if (value === false || value === 'no' || value === 'false') return 'No'
    return String(value)
  }
  if (columnId === 'breakdown_duration_hours' || columnId === 'vendor_expense' || columnId === 'labour_count') {
    const n = Number(value)
    return Number.isFinite(n) ? String(n) : String(value)
  }
  return String(value)
}

function clampHour(value) {
  const hour = Number(value)
  if (!Number.isInteger(hour)) return 0
  return Math.min(23, Math.max(0, hour))
}

function clampWeekday(value, fallback = 1) {
  const day = Number(value)
  if (!Number.isInteger(day)) return fallback
  return ((day % 7) + 7) % 7
}

function atUtc(year, monthIndex, day, hour) {
  return new Date(Date.UTC(year, monthIndex, day, hour, 0, 0, 0))
}

function nextWeekdayAt(now, weekday, hour) {
  const next = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour)
  const diff = (weekday - next.getUTCDay() + 7) % 7
  next.setUTCDate(next.getUTCDate() + diff)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
  return next
}

function nextMonthDayAt(now, monthDay, hour, step) {
  const wanted = Math.min(31, Math.max(1, Number(monthDay) || 1))
  const monthDate = (year, monthIndex) => {
    const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
    return atUtc(year, monthIndex, Math.min(wanted, last), hour)
  }
  let year = now.getUTCFullYear()
  let month = now.getUTCMonth()
  let next = monthDate(year, month)
  if (next <= now) {
    month += step
    while (month > 11) {
      month -= 12
      year += 1
    }
    next = monthDate(year, month)
  }
  return next
}

export function computeNextRunAt(schedule, from = new Date()) {
  const hour = clampHour(schedule.send_hour)
  const now = new Date(from)
  const frequency = String(schedule.frequency || 'daily')

  if (frequency === 'twice_daily') {
    const hour2 = clampHour(schedule.send_hour_2 == null ? (hour + 12) % 24 : schedule.send_hour_2)
    const first = Math.min(hour, hour2)
    const second = Math.max(hour, hour2)
    const todayFirst = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), first)
    const todaySecond = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), second)
    if (now < todayFirst) return todayFirst.toISOString()
    if (now < todaySecond) return todaySecond.toISOString()
    todayFirst.setUTCDate(todayFirst.getUTCDate() + 1)
    return todayFirst.toISOString()
  }

  if (frequency === 'weekly') {
    return nextWeekdayAt(now, clampWeekday(schedule.weekday), hour).toISOString()
  }

  if (frequency === 'biweekly') {
    let next = nextWeekdayAt(now, clampWeekday(schedule.weekday), hour)
    const last = schedule.last_sent_at ? new Date(schedule.last_sent_at) : null
    if (last && !Number.isNaN(last.getTime())) {
      const min = new Date(last)
      min.setUTCDate(min.getUTCDate() + 14)
      while (next < min) next.setUTCDate(next.getUTCDate() + 7)
    }
    return next.toISOString()
  }

  if (frequency === 'twice_weekly') {
    const dayA = clampWeekday(schedule.weekday)
    const dayB = clampWeekday(schedule.weekday_2, (dayA + 3) % 7)
    const first = nextWeekdayAt(now, dayA, hour)
    const second = nextWeekdayAt(now, dayB, hour)
    return (first <= second ? first : second).toISOString()
  }

  if (MONTH_DAY_FREQUENCIES.includes(frequency)) {
    const step = MONTH_STEPS[frequency] || 1
    return nextMonthDayAt(now, schedule.month_day, hour, step).toISOString()
  }

  const interval = DAY_INTERVALS[frequency] || 1
  const next = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour)
  if (next <= now) next.setUTCDate(next.getUTCDate() + interval)
  return next.toISOString()
}
