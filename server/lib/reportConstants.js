export const REPORT_CATALOG = {
  'daily-logs': {
    key: 'daily-logs',
    moduleKey: 'reports_daily_logs',
    title: 'Daily Logs',
    kind: 'logs',
    dayStatus: null,
  },
  'open-logs': {
    key: 'open-logs',
    moduleKey: 'reports_open_logs',
    title: 'Open Logs',
    kind: 'logs',
    dayStatus: 'open',
  },
  'completed-logs': {
    key: 'completed-logs',
    moduleKey: 'reports_completed_logs',
    title: 'Completed Logs',
    kind: 'logs',
    dayStatus: 'closed',
  },
  'plant-wise': {
    key: 'plant-wise',
    moduleKey: 'reports_plant_wise',
    title: 'Plant Wise Report',
    kind: 'plant',
    dayStatus: null,
  },
  overdue: {
    key: 'overdue',
    moduleKey: 'reports_overdue',
    title: 'Overdue Workorders',
    kind: 'overdue',
    dayStatus: null,
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

export const OVERDUE_COLUMNS = [
  { id: 'wo_number', label: 'WO #' },
  { id: 'short_description', label: 'Short description' },
  { id: 'plant', label: 'Plant' },
  { id: 'department', label: 'Department' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
  { id: 'source', label: 'Source' },
  { id: 'due_at', label: 'Due date' },
  { id: 'aging_days', label: 'Aging days' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'pm_plan_number', label: 'PM plan #' },
]

export const DATE_WINDOWS = ['previous_day', 'last_7_days', 'last_30_days', 'month_to_date']
export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly']

export function getReportCatalog(key) {
  return REPORT_CATALOG[key] || null
}

export function columnsForReport(kind) {
  if (kind === 'plant') return PLANT_COLUMNS
  if (kind === 'overdue') return OVERDUE_COLUMNS
  return LOG_COLUMNS
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

export function computeNextRunAt(schedule, from = new Date()) {
  const hour = Math.min(23, Math.max(0, Number(schedule.send_hour) || 0))
  const now = new Date(from)

  const atUtc = (year, monthIndex, day) => new Date(Date.UTC(year, monthIndex, day, hour, 0, 0, 0))

  if (schedule.frequency === 'weekly') {
    const target = Number(schedule.weekday)
    const weekday = Number.isFinite(target) ? ((target % 7) + 7) % 7 : 1
    const next = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const diff = (weekday - next.getUTCDay() + 7) % 7
    next.setUTCDate(next.getUTCDate() + diff)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 7)
    return next.toISOString()
  }

  if (schedule.frequency === 'monthly') {
    const wanted = Math.min(31, Math.max(1, Number(schedule.month_day) || 1))
    const monthDate = (year, monthIndex) => {
      const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
      return atUtc(year, monthIndex, Math.min(wanted, last))
    }
    let year = now.getUTCFullYear()
    let month = now.getUTCMonth()
    let next = monthDate(year, month)
    if (next <= now) {
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
      next = monthDate(year, month)
    }
    return next.toISOString()
  }

  const next = atUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}
