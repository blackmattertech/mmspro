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
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'runtime',
  'meter',
  'calendar',
  'shutdown',
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
export const PM_PLAN_STATUSES = ['active', 'inactive']

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
