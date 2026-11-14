import { formatDisplayDateTime } from './displayDate'

export const SCHEDULE_WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

export const SCHEDULE_WINDOWS = [
  { value: 'previous_day', label: 'Previous day' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'month_to_date', label: 'Month to date' },
]

export const SCHEDULE_FREQUENCIES = [
  { value: 'daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'every_2_days', label: 'Once in 2 days' },
  { value: 'every_3_days', label: 'Once in 3 days' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'twice_weekly', label: 'Twice a week' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
]

export function scheduleHourLabel(hour) {
  return `${String(Number(hour) || 0).padStart(2, '0')}:00 UTC`
}

function weekdayName(value) {
  return SCHEDULE_WEEKDAYS.find((item) => item.value === Number(value))?.label || 'weekday'
}

export function scheduleFrequencyLabel(row) {
  const hour = scheduleHourLabel(row.send_hour)
  switch (row.frequency) {
    case 'daily':
      return `Once a day at ${hour}`
    case 'twice_daily':
      return `Twice a day at ${hour} and ${scheduleHourLabel(row.send_hour_2)}`
    case 'every_2_days':
      return `Once in 2 days at ${hour}`
    case 'every_3_days':
      return `Once in 3 days at ${hour}`
    case 'weekly':
      return `Every ${weekdayName(row.weekday)} at ${hour}`
    case 'twice_weekly':
      return `${weekdayName(row.weekday)} and ${weekdayName(row.weekday_2)} at ${hour}`
    case 'biweekly':
      return `Every 2 weeks on ${weekdayName(row.weekday)} at ${hour}`
    case 'monthly':
      return `Monthly on day ${row.month_day} at ${hour}`
    case 'quarterly':
      return `Quarterly on day ${row.month_day} at ${hour}`
    case 'half_yearly':
      return `Half-yearly on day ${row.month_day} at ${hour}`
    case 'yearly':
      return `Yearly on day ${row.month_day} at ${hour}`
    default:
      return SCHEDULE_FREQUENCIES.find((item) => item.value === row.frequency)?.label || row.frequency
  }
}

export function scheduleWindowLabel(value) {
  return SCHEDULE_WINDOWS.find((item) => item.value === value)?.label || value || '—'
}

export function formatScheduleTimestamp(value) {
  if (!value) return '—'
  return formatDisplayDateTime(value) || String(value)
}
