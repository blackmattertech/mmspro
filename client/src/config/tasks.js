export const TASK_TABS = [
  { id: 'assigned_to_me', label: 'Assigned To Me' },
  { id: 'assigned_by_me', label: 'Assigned By Me' },
]

/** Spec "Task Type" — who can see the task */
export const VISIBILITY_OPTIONS = [
  { value: 'self', label: 'Self' },
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Department' },
  { value: 'location', label: 'Location' },
]

/** Spec "Recurring Task" Yes/No */
export const TASK_TYPE_OPTIONS = [
  { value: 'one_time', label: 'No' },
  { value: 'recurring', label: 'Yes' },
]

export const RECURRENCE_FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
]

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

export const REMINDER_OPTIONS = [
  { value: '1d', label: '1 Day Before' },
  { value: '3d', label: '3 Days Before' },
  { value: '7d', label: '7 Days Before' },
  { value: '15d', label: '15 Days Before' },
  { value: '30d', label: '30 Days Before' },
  { value: '60d', label: '60 Days Before' },
  { value: '90d', label: '90 Days Before' },
  { value: 'at_due', label: 'At Due Time' },
  { value: 'custom', label: 'Custom (minutes before)' },
]

export const REFERENCE_TYPE_OPTIONS = [
  { value: 'work_order', label: 'Work Order No.' },
  { value: 'purchase_order', label: 'PO No.' },
  { value: 'purchase_request', label: 'PR No.' },
  { value: 'vendor_ref', label: 'Vendor Ref.' },
  { value: 'contract', label: 'Contract No.' },
  { value: 'amc', label: 'AMC No.' },
  { value: 'document', label: 'Document No.' },
  { value: 'custom', label: 'Other Reference' },
]

export const DUE_STATUS_LABELS = {
  upcoming: 'Upcoming',
  due_today: 'Due Today',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  completed_on_time: 'Completed On Time',
  completed_late: 'Completed Late',
}
