/** Shared calendar UI constants. */

export const EVENT_SOURCE_COLORS = {
  task: '#E63946',
  work_order: '#2563EB',
  work_request: '#D97706',
  pm_plan: '#0D9488',
  warranty: '#7C3AED',
  followup: '#8B5CF6',
  high: '#E63946',
  medium: '#FFB020',
  low: '#22C55E',
}

export const EVENT_SOURCE_BG = {
  task: '#FFF1F2',
  work_order: '#EFF6FF',
  work_request: '#FFFBEB',
  pm_plan: '#F0FDFA',
  warranty: '#F5F3FF',
  followup: '#F5F3FF',
  high: '#FFF1F2',
  medium: '#FFFBEB',
  low: '#F0FDF4',
}

/** @deprecated use EVENT_SOURCE_COLORS */
export const TASK_TYPE_COLORS = EVENT_SOURCE_COLORS
/** @deprecated use EVENT_SOURCE_BG */
export const TASK_TYPE_BG = EVENT_SOURCE_BG

export const SOURCE_FILTERS = [
  { value: 'all', label: 'All items' },
  { value: 'task', label: 'Tasks' },
  { value: 'work_order', label: 'Work orders' },
  { value: 'work_request', label: 'Work requests' },
  { value: 'pm_plan', label: 'PM schedules' },
  { value: 'warranty', label: 'Warranties' },
]

export const SOURCE_LABELS = {
  task: 'Task',
  work_order: 'Work order',
  work_request: 'Work request',
  pm_plan: 'PM schedule',
  warranty: 'Warranty',
  followup: 'Follow-up',
}

export const LEGEND_ITEMS = [
  { key: 'task', label: 'Task' },
  { key: 'work_order', label: 'Work order' },
  { key: 'work_request', label: 'Work request' },
  { key: 'pm_plan', label: 'PM schedule' },
  { key: 'warranty', label: 'Warranty' },
]

export const QUICK_FILTERS = [
  { id: 'all', label: 'All items', icon: 'list' },
  { id: 'assigned', label: 'Assigned To Me', icon: 'user' },
  { id: 'task', label: 'Tasks', icon: 'check' },
  { id: 'work_order', label: 'Work orders', icon: 'clock' },
  { id: 'work_request', label: 'Work requests', icon: 'alert' },
  { id: 'pm_plan', label: 'PM schedules', icon: 'flag' },
]

export function eventColorKey(event) {
  return event?.colorKey || event?.source || event?.priority || 'task'
}
