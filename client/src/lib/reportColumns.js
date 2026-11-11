export const UNIFIED_REPORT_KEY = 'logs'
export const WORK_REQUEST_REPORT_KEY = 'work-requests'
export const PM_PLAN_REPORT_KEY = 'pm-plans'
export const METER_READING_REPORT_KEY = 'meter-readings'
export const TASK_REPORT_KEY = 'tasks'
export const WARRANTY_REPORT_KEY = 'warranties'
export const EQUIPMENT_REPORT_KEY = 'equipment'

export const REPORT_TYPE_OPTIONS = [
  { value: UNIFIED_REPORT_KEY, label: 'Work Orders', kind: 'unified', icon: 'document' },
  { value: WORK_REQUEST_REPORT_KEY, label: 'Work Requests', kind: 'work_request', icon: 'clipboard' },
  { value: PM_PLAN_REPORT_KEY, label: 'Preventive Maintenance', kind: 'pm_plan', icon: 'alarmCheck' },
  { value: METER_READING_REPORT_KEY, label: 'Meter Reading', kind: 'meter_reading', icon: 'logbook' },
  { value: TASK_REPORT_KEY, label: 'Tasks & Follow-ups', kind: 'task', icon: 'alarmCheck' },
  { value: WARRANTY_REPORT_KEY, label: 'Warranties', kind: 'warranty', icon: 'shieldLock' },
  { value: EQUIPMENT_REPORT_KEY, label: 'Assets', kind: 'equipment', icon: 'washer' },
  { value: 'plant-wise', label: 'Plant Wise', kind: 'plant', icon: 'chart' },
  { value: 'overdue', label: 'Overdue Work Orders', kind: 'overdue', icon: 'chart' },
]

export const LEGACY_REPORT_KEYS = new Set([
  'daily-logs',
  'open-logs',
  'completed-logs',
])

export const REPORT_TITLES = {
  logs: 'Work Orders',
  'work-requests': 'Work Requests',
  'pm-plans': 'Preventive Maintenance',
  'meter-readings': 'Meter Reading',
  tasks: 'Tasks & Follow-ups',
  warranties: 'Warranties',
  equipment: 'Assets',
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
  { id: 'equipment', label: 'Asset' },
  { id: 'equipment_type', label: 'Asset Type' },
  { id: 'equipment_capacity', label: 'Asset Capacity' },
  { id: 'equipment_tag', label: 'Asset Tag' },
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
  { id: 'equipment', label: 'Asset' },
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
  { id: 'equipment', label: 'Asset' },
  { id: 'pm_plan_number', label: 'PM plan #' },
]

export const WORK_REQUEST_COLUMNS = [
  { id: 'request_number', label: 'Request #' },
  { id: 'request_date', label: 'Request date' },
  { id: 'request_type', label: 'Request type' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'job_nature', label: 'Job Nature' },
  { id: 'order_from', label: 'Order From' },
  { id: 'order_to', label: 'Order To' },
  { id: 'area', label: 'Area' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'equipment', label: 'Asset' },
  { id: 'equipment_type', label: 'Asset Type' },
  { id: 'equipment_capacity', label: 'Asset Capacity' },
  { id: 'equipment_tag', label: 'Asset Tag' },
  { id: 'reported_by', label: 'Reported By' },
  { id: 'short_description', label: 'Short description' },
  { id: 'problem_description', label: 'Problem description' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'execution_status', label: 'Execution status' },
  { id: 'is_breakdown', label: 'Breakdown' },
]

export const PM_PLAN_COLUMNS = [
  { id: 'plan_number', label: 'PM plan #' },
  { id: 'name', label: 'Plan name' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'schedule_type', label: 'Schedule type' },
  { id: 'activity_type', label: 'Activity type' },
  { id: 'area', label: 'Area' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'department', label: 'Department' },
  { id: 'equipment', label: 'Asset' },
  { id: 'equipment_type', label: 'Asset Type' },
  { id: 'equipment_capacity', label: 'Asset Capacity' },
  { id: 'equipment_tag', label: 'Asset Tag' },
  { id: 'work_center', label: 'Work Center' },
  { id: 'next_due_at', label: 'Next due' },
  { id: 'start_date', label: 'Start date' },
  { id: 'end_date', label: 'End date' },
  { id: 'assignees', label: 'Assigned To' },
  { id: 'created_by', label: 'Created By' },
  { id: 'estimated_labour_hours', label: 'Est. labour hours' },
  { id: 'contractor', label: 'Contractor' },
]

export const METER_READING_COLUMNS = [
  { id: 'reading_at', label: 'Reading time' },
  { id: 'reading', label: 'Reading' },
  { id: 'equipment', label: 'Asset' },
  { id: 'equipment_code', label: 'Asset code' },
  { id: 'area', label: 'Area' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'logged_by', label: 'Logged by' },
  { id: 'logged_by_department', label: 'Department' },
  { id: 'logged_by_designation', label: 'Designation' },
]

export const TASK_COLUMNS = [
  { id: 'task_number', label: 'Task #' },
  { id: 'title', label: 'Title' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'category', label: 'Category' },
  { id: 'task_type', label: 'Type' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'department', label: 'Department' },
  { id: 'assignees', label: 'Assigned To' },
  { id: 'due_date', label: 'Due date' },
  { id: 'start_date', label: 'Start date' },
  { id: 'created_by', label: 'Created By' },
  { id: 'short_description', label: 'Short description' },
  { id: 'vendor', label: 'Vendor' },
]

export const WARRANTY_COLUMNS = [
  { id: 'serial_number', label: 'Serial #' },
  { id: 'make', label: 'Make' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'purchase_date', label: 'Purchase date' },
  { id: 'warranty_start', label: 'Warranty start' },
  { id: 'warranty_end', label: 'Warranty end' },
  { id: 'warranty_period_months', label: 'Period (months)' },
  { id: 'po_number', label: 'PO #' },
  { id: 'invoice_number', label: 'Invoice #' },
  { id: 'contact_name', label: 'Contact' },
  { id: 'contact_phone', label: 'Phone' },
  { id: 'contact_email', label: 'Email' },
  { id: 'status', label: 'Status' },
]

export const EQUIPMENT_COLUMNS = [
  { id: 'code', label: 'Asset code' },
  { id: 'name', label: 'Asset name' },
  { id: 'area', label: 'Area' },
  { id: 'plant', label: 'Plant / Facility' },
  { id: 'department', label: 'Department' },
  { id: 'equipment_type', label: 'Asset Type' },
  { id: 'equipment_capacity', label: 'Asset Capacity' },
  { id: 'equipment_tag', label: 'Asset Tag' },
  { id: 'reading_required', label: 'Meter required' },
  { id: 'last_meter_reading', label: 'Last reading' },
  { id: 'last_meter_reading_at', label: 'Last reading at' },
  { id: 'is_active', label: 'Active' },
  { id: 'created_at', label: 'Created' },
]

export function kindForReportKey(reportKey) {
  return REPORT_TYPE_OPTIONS.find((opt) => opt.value === reportKey)?.kind
    || (reportKey === 'plant-wise' ? 'plant' : reportKey === 'overdue' ? 'overdue' : 'logs')
}

export function isKnownReportType(reportKey) {
  return REPORT_TYPE_OPTIONS.some((opt) => opt.value === reportKey)
}

export function columnsForReportKey(reportKey) {
  if (reportKey === UNIFIED_REPORT_KEY) return LOGS_COLUMNS
  if (reportKey === WORK_REQUEST_REPORT_KEY) return WORK_REQUEST_COLUMNS
  if (reportKey === PM_PLAN_REPORT_KEY) return PM_PLAN_COLUMNS
  if (reportKey === METER_READING_REPORT_KEY) return METER_READING_COLUMNS
  if (reportKey === TASK_REPORT_KEY) return TASK_COLUMNS
  if (reportKey === WARRANTY_REPORT_KEY) return WARRANTY_COLUMNS
  if (reportKey === EQUIPMENT_REPORT_KEY) return EQUIPMENT_COLUMNS
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
  if (['log_date', 'request_date', 'start_date', 'end_date'].includes(columnId)) {
    return String(value).slice(0, 10)
  }
  if ([
    'started_at',
    'ended_at',
    'due_at',
    'next_due_at',
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
  if ([
    'day_status',
    'wo_status',
    'status',
    'priority',
    'source',
    'order_type',
    'source_type',
    'request_type',
    'execution_status',
    'schedule_type',
  ].includes(columnId)) {
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  }
  if (columnId === 'permit_required' || columnId === 'is_breakdown') {
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
