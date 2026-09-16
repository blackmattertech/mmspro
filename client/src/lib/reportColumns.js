export const UNIFIED_REPORT_KEY = 'logs'

export const REPORT_TITLES = {
  logs: 'Reports',
  'daily-logs': 'Daily Logs',
  'open-logs': 'Open Logs',
  'completed-logs': 'Completed Logs',
  'plant-wise': 'Plant Wise Report',
  overdue: 'Overdue Workorders',
}

export const LOGS_COLUMNS = [
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
  { id: 'progress_percent', label: 'Progress %' },
  { id: 'source', label: 'Source' },
  { id: 'due_at', label: 'Due date' },
  { id: 'aging_days', label: 'Aging days' },
  { id: 'assignees', label: 'Assignees' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'pm_plan_number', label: 'PM plan #' },
]

export function columnsForReportKey(reportKey) {
  if (reportKey === UNIFIED_REPORT_KEY) return LOGS_COLUMNS
  if (reportKey === 'plant-wise') return PLANT_COLUMNS
  if (reportKey === 'overdue') return OVERDUE_COLUMNS
  return LOG_COLUMNS
}

export function defaultReportDateRange() {
  const to = new Date()
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 6))
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return { from: iso(from), to: iso(new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))) }
}

export const EMPTY_REPORT_FILTERS = {
  from_date: '',
  to_date: '',
  order_type: '',
  order_from: '',
  order_to: '',
  area_id: '',
  facility_id: '',
  equipment_id: '',
  equipment_type: '',
  equipment_capacity: '',
  equipment_tag: '',
  priority: '',
  status: '',
  job_nature: '',
  created_by: '',
  reported_by: '',
  assigned_to: '',
}

export function defaultReportFilters(dateRange = defaultReportDateRange()) {
  return {
    ...EMPTY_REPORT_FILTERS,
    from_date: dateRange.from,
    to_date: dateRange.to,
  }
}

export function formatReportCell(columnId, value) {
  if (value == null || value === '') return '—'
  if (columnId === 'progress_percent') {
    const n = Number(value)
    return Number.isFinite(n) ? `${n}%` : '—'
  }
  if (columnId === 'log_date') {
    return String(value).slice(0, 10)
  }
  if ([
    'started_at',
    'ended_at',
    'due_at',
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
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (['day_status', 'wo_status', 'status', 'priority', 'source', 'order_type', 'source_type'].includes(columnId)) {
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  }
  if (columnId === 'permit_required') {
    if (value === true || value === 'yes' || value === 'true') return 'Yes'
    if (value === false || value === 'no' || value === 'false') return 'No'
    return String(value)
  }
  return String(value)
}

export function formatKpiDelta(kpi) {
  if (kpi?.delta == null || kpi?.previous == null) return ''
  if (Number(kpi.delta) === 0) return 'No change vs prior period'
  const sign = Number(kpi.delta) > 0 ? '+' : ''
  return `${sign}${kpi.delta} (${sign}${kpi.delta_pct}%) vs prior period`
}
