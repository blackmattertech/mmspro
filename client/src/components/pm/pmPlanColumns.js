export const PM_PLAN_COLUMNS = [
  { id: 'plan_number', label: 'Plan #' },
  { id: 'name', label: 'Name' },
  { id: 'department', label: 'Department' },
  { id: 'activity', label: 'Activity' },
  { id: 'work_center', label: 'Work center' },
  { id: 'priority', label: 'Priority' },
  { id: 'location', label: 'Plant / Facility' },
  { id: 'area', label: 'Area' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'schedule_type', label: 'Schedule type', defaultVisible: false },
  { id: 'calendar_unit', label: 'Interval type', defaultVisible: false },
  { id: 'every_n', label: 'Interval value', defaultVisible: false },
  { id: 'start_date', label: 'Start date' },
  { id: 'end_date', label: 'End date', defaultVisible: false },
  { id: 'grace_days', label: 'Grace period (days)', defaultVisible: false },
  { id: 'generate_before_days', label: 'Generate before due', defaultVisible: false },
  { id: 'last_reading', label: 'Last reading', defaultVisible: false },
  { id: 'last_service_date', label: 'Last service date', defaultVisible: false },
  { id: 'reading_interval', label: 'Reading value', defaultVisible: false },
  { id: 'whichever_comes_first', label: 'Whichever comes first', defaultVisible: false },
  { id: 'next_due', label: 'Next due' },
  { id: 'technicians', label: 'Technicians' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'status', label: 'Status' },
  { id: 'last_generated_at', label: 'Last generated', defaultVisible: false },
  { id: 'created_at', label: 'Created', defaultVisible: false },
  { id: 'actions', label: 'Actions', locked: true },
]

export const PM_PLAN_DEFAULT_COLUMN_IDS = PM_PLAN_COLUMNS
  .filter((col) => col.defaultVisible !== false)
  .map((col) => col.id)
