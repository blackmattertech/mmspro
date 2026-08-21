export const PM_SCHEDULE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'calendar', label: 'Calendar Based' },
  { value: 'runtime', label: 'Runtime Based' },
  { value: 'meter', label: 'Meter Based' },
  { value: 'shutdown', label: 'Shutdown Based' },
]

export const CALENDAR_SCHEDULE_TYPES = new Set([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'calendar',
])

export const PM_PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const CHECKLIST_FIELD_TYPES = [
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Radio Button' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'short_text', label: 'Short Text' },
  { value: 'multiline', label: 'Multi-line Text' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'image', label: 'Image Upload' },
  { value: 'signature', label: 'Signature' },
  { value: 'qr', label: 'QR Code Scan' },
  { value: 'barcode', label: 'Barcode Scan' },
]

export const OPTION_CHECKLIST_FIELD_TYPES = new Set(['dropdown', 'radio'])

export function scheduleTypeLabel(value) {
  return PM_SCHEDULE_TYPES.find((row) => row.value === value)?.label || value || '—'
}

export function checklistFieldTypeLabel(value) {
  return CHECKLIST_FIELD_TYPES.find((row) => row.value === value)?.label || value || '—'
}

export function formatScheduleSummary(plan) {
  if (!plan) return '—'
  const label = scheduleTypeLabel(plan.schedule_type)
  const every = Number(plan.every_n) || 1
  if (every > 1 && CALENDAR_SCHEDULE_TYPES.has(plan.schedule_type)) {
    return `Every ${every} · ${label}`
  }
  return label
}
