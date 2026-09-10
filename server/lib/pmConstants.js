export const DEFAULT_ACTIVITY_TYPES = [
  { name: 'Inspection', description: 'Visual inspection and equipment condition assessment', sort_order: 10 },
  { name: 'Calibration', description: 'Instrument calibration', sort_order: 20 },
  { name: 'Functional Test', description: 'Operational testing', sort_order: 30 },
  { name: 'Cleaning', description: 'Cleaning of equipment and panels', sort_order: 40 },
  { name: 'Lubrication', description: 'Lubrication of rotating equipment', sort_order: 50 },
  { name: 'Battery Maintenance', description: 'Battery inspection and replacement', sort_order: 60 },
  { name: 'Condition Monitoring', description: 'Vibration, temperature and pressure monitoring', sort_order: 70 },
  { name: 'Preventive Maintenance', description: 'OEM recommended maintenance', sort_order: 80 },
  { name: 'Regulatory Inspection', description: 'Statutory inspection', sort_order: 90 },
  { name: 'Shutdown Maintenance', description: 'Planned shutdown activities', sort_order: 100 },
  { name: 'Custom Activity', description: 'User-defined maintenance type', sort_order: 110 },
]

export const PM_SCHEDULE_TYPES = [
  'calendar',
  'reading',
  'both',
]

export const PM_CALENDAR_UNITS = [
  'day',
  'week',
  'month',
  'quarter',
  'half_yearly',
  'yearly',
]

/** Types that advance due dates from the calendar interval. */
export const CALENDAR_SCHEDULE_TYPES = new Set([
  'calendar',
  'both',
  // Legacy values still present on older plans
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
])

const READING_LEGACY_TYPES = new Set(['runtime', 'meter', 'shutdown', 'reading'])

const LEGACY_UNIT_BY_SCHEDULE = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  half_yearly: 'half_yearly',
  yearly: 'yearly',
  calendar: 'month',
}

export function normalizeScheduleType(value) {
  const type = String(value || '').trim()
  if (type === 'calendar' || type === 'reading' || type === 'both') return type
  if (READING_LEGACY_TYPES.has(type)) return 'reading'
  if (CALENDAR_SCHEDULE_TYPES.has(type)) return 'calendar'
  return 'calendar'
}

export function normalizeCalendarUnit(value, scheduleType) {
  const unit = String(value || '').trim()
  if (PM_CALENDAR_UNITS.includes(unit)) return unit
  return LEGACY_UNIT_BY_SCHEDULE[String(scheduleType || '').trim()] || 'month'
}

export const CHECKLIST_FIELD_TYPES = [
  'checkbox',
  'dropdown',
  'radio',
  'numeric',
  'decimal',
  'short_text',
  'multiline',
  'date',
  'time',
  'image',
  'signature',
  'qr',
  'barcode',
]

export const OPTION_CHECKLIST_FIELD_TYPES = new Set(['dropdown', 'radio'])

export const PM_PRIORITIES = ['high', 'medium', 'low']
export const PM_PLAN_STATUSES = ['active', 'inactive', 'overdue']

export const WO_OPEN_FOR_PLAN = [
  'assigned',
  'accepted',
  'started',
  'in_progress',
  'waiting_material',
  'waiting_shutdown',
  'on_hold',
  'returned_rework',
  'completed',
  'verified',
]
