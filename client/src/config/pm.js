export const PM_SCHEDULE_TYPES = [
  { value: 'calendar', label: 'Calendar Based' },
  { value: 'reading', label: 'Reading Based' },
  { value: 'both', label: 'Both' },
]

export const PM_CALENDAR_UNITS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
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
  if (PM_CALENDAR_UNITS.some((row) => row.value === unit)) return unit
  const legacy = LEGACY_UNIT_BY_SCHEDULE[String(scheduleType || '').trim()]
  return legacy || 'month'
}

export const PM_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const CHECKLIST_FIELD_TYPES = [
  { value: 'checkbox', label: 'Boolean (checkbox)' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Radio Button' },
  { value: 'numeric', label: 'Number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'short_text', label: 'Text Field' },
  { value: 'multiline', label: 'Multi-line Text' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'image', label: 'Image Upload' },
  { value: 'signature', label: 'Signature' },
  { value: 'qr', label: 'QR Code Scan' },
  { value: 'barcode', label: 'Barcode Scan' },
]

/** Quick presets shown in the builder (map to field_type + options). */
export const CHECKLIST_FIELD_PRESETS = [
  {
    id: 'yes_no_na',
    label: 'Yes-No-NA',
    field_type: 'radio',
    options: ['Yes', 'No', 'NA'],
  },
  {
    id: 'pass_fail_na',
    label: 'Pass-Fail-NA',
    field_type: 'radio',
    options: ['Pass', 'Fail', 'NA'],
  },
  {
    id: 'ok_faulty_na',
    label: 'Ok-Faulty-NA',
    field_type: 'radio',
    options: ['Ok', 'Faulty', 'NA'],
  },
  {
    id: 'good_repair_replace_na',
    label: 'Good-Repair-Replace-NA',
    field_type: 'radio',
    options: ['Good', 'Repair', 'Replace', 'NA'],
  },
  { id: 'checkbox', label: 'Boolean (checkbox)', field_type: 'checkbox', options: [] },
  { id: 'short_text', label: 'Text Field', field_type: 'short_text', options: [] },
  { id: 'numeric', label: 'Number', field_type: 'numeric', options: [] },
  { id: 'dropdown', label: 'Dropdown (custom)', field_type: 'dropdown', options: [] },
  { id: 'multiline', label: 'Multi-line Text', field_type: 'multiline', options: [] },
  { id: 'date', label: 'Date', field_type: 'date', options: [] },
]

export const OPTION_CHECKLIST_FIELD_TYPES = new Set(['dropdown', 'radio'])

export function scheduleTypeLabel(value) {
  const normalized = normalizeScheduleType(value)
  return PM_SCHEDULE_TYPES.find((row) => row.value === normalized)?.label || value || '—'
}

export function calendarUnitLabel(value) {
  return PM_CALENDAR_UNITS.find((row) => row.value === value)?.label || value || '—'
}

export function checklistFieldTypeLabel(value) {
  return CHECKLIST_FIELD_TYPES.find((row) => row.value === value)?.label || value || '—'
}

export function formatScheduleSummary(plan) {
  if (!plan) return '—'
  const type = normalizeScheduleType(plan.schedule_type)
  const label = scheduleTypeLabel(type)
  if (type === 'reading') {
    const interval = Number(plan.reading_interval)
    return Number.isFinite(interval) && interval > 0 ? `${label} · every ${interval}` : label
  }
  const every = Number(plan.every_n) || 1
  const unit = calendarUnitLabel(normalizeCalendarUnit(plan.calendar_unit, plan.schedule_type))
  if (type === 'both') {
    return `${label} · every ${every} ${unit}`
  }
  return every > 1 ? `Every ${every} · ${unit}` : unit
}
