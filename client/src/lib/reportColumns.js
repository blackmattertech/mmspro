export const REPORT_TITLES = {
  'daily-logs': 'Daily Logs',
  'open-logs': 'Open Logs',
  'completed-logs': 'Completed Logs',
  'plant-wise': 'Plant Wise Report',
  overdue: 'Overdue Workorders',
}

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

export function columnsForReportKey(reportKey) {
  if (reportKey === 'plant-wise') return PLANT_COLUMNS
  if (reportKey === 'overdue') return OVERDUE_COLUMNS
  return LOG_COLUMNS
}

export function defaultReportDateRange() {
  const to = new Date()
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 29))
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return { from: iso(from), to: iso(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))) }
}

export function formatReportCell(columnId, value) {
  if (value == null || value === '') return '—'
  if (['started_at', 'ended_at', 'due_at'].includes(columnId)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (['day_status', 'wo_status', 'status', 'priority', 'source'].includes(columnId)) {
    return String(value).replace(/_/g, ' ')
  }
  return String(value)
}

export function formatKpiDelta(kpi) {
  if (kpi?.delta == null || kpi?.previous == null) return ''
  if (Number(kpi.delta) === 0) return 'No change vs prior period'
  const sign = Number(kpi.delta) > 0 ? '+' : ''
  return `${sign}${kpi.delta} (${sign}${kpi.delta_pct}%) vs prior period`
}
