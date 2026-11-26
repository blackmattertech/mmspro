const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Human label for warranty item reminder settings (asset master + lists). */
export function formatWarrantyReminderLabel(item = {}) {
  const mode = String(item.reminder_mode || 'one_time').toLowerCase()
  const lead = Number(item.expiry_notification_days)
  const leadText = Number.isFinite(lead) && lead >= 0
    ? (lead === 0 ? 'on expiry day' : `${lead} days before`)
    : null

  if (mode !== 'recurring') {
    return leadText ? `One-time · ${leadText}` : 'One-time reminder'
  }

  const frequency = String(item.reminder_frequency || 'weekly').toLowerCase()
  let cadence = 'Weekly'
  if (frequency === 'daily') cadence = 'Daily'
  else if (frequency === 'monthly') cadence = 'Monthly'
  else if (frequency === 'custom') {
    const interval = Math.max(1, Number(item.reminder_interval) || 1)
    const unit = String(item.reminder_unit || 'days').toLowerCase()
    const unitLabel = unit === 'weeks' ? 'weeks' : (unit === 'months' ? 'months' : 'days')
    cadence = `Every ${interval} ${unitLabel}`
  } else if (frequency === 'weekly') {
    const days = Array.isArray(item.reminder_weekdays)
      ? item.reminder_weekdays.map(Number).filter((day) => day >= 0 && day <= 6)
      : []
    if (days.length) {
      cadence = `Weekly (${days.map((day) => WEEKDAY_SHORT[day]).join(', ')})`
    }
  }

  const parts = [`${cadence} until expiry`]
  if (leadText) parts.push(`starts ${leadText}`)
  if (item.reminder_next_at) parts.push(`next ${String(item.reminder_next_at).slice(0, 10)}`)
  return parts.join(' · ')
}
