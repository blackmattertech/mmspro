import {
  advanceReminderDate,
  firstReminderDate,
  leadDaysForItem,
  normalizeReminderFrequency,
  normalizeReminderInterval,
  normalizeReminderMode,
  normalizeReminderUnit,
  normalizeReminderWeekdays,
  reminderAdvanceOptions,
  snapToWeekdays,
} from './warrantyReminderSchedule.js'

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function parseDate(value) {
  const text = trimOrNull(value)
  return text || null
}

function parseInteger(value) {
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? Math.round(num) : null
}

function parseDecimal(value) {
  if (value === '' || value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseAssetHierarchy(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function itemHasContent(item) {
  return Boolean(
    item.product_name
    || item.model_part_no
    || item.value != null
    || item.remarks
    || item.purchase_date
    || item.make
    || item.po_number
    || item.po_date
    || item.invoice_number
    || item.invoice_date
    || item.warranty_start
    || item.warranty_end
    || item.warranty_period_months != null
    || item.expiry_notification_days != null
    || item.equipment_id
    || item.keep_line === true,
  )
}

/**
 * Pure normalize for warranty line items (no DB).
 * @param {Array} items
 * @param {{ clipRemarks?: (text: string) => string|null }} [options]
 */
export function normalizeWarrantyItems(items, options = {}) {
  if (!Array.isArray(items)) return []
  const clipRemarks = options.clipRemarks || ((text) => trimOrNull(text))
  return items
    .map((item, index) => {
      const reminder_mode = normalizeReminderMode(item.reminder_mode)
      const reminder_frequency = normalizeReminderFrequency(reminder_mode, item.reminder_frequency)
      const reminder_interval = normalizeReminderInterval(reminder_frequency, item.reminder_interval)
      const reminder_unit = normalizeReminderUnit(reminder_frequency, item.reminder_unit)
      const reminder_weekdays = normalizeReminderWeekdays(reminder_frequency, item.reminder_weekdays)
      const base = {
        line_number: index + 1,
        product_name: trimOrNull(item.product_name),
        model_part_no: trimOrNull(item.model_part_no),
        value: parseDecimal(item.value),
        remarks: clipRemarks(item.remarks),
        purchase_date: parseDate(item.purchase_date),
        make: trimOrNull(item.make),
        po_number: trimOrNull(item.po_number),
        po_date: parseDate(item.po_date),
        invoice_number: trimOrNull(item.invoice_number),
        invoice_date: parseDate(item.invoice_date),
        warranty_start: parseDate(item.warranty_start),
        warranty_end: parseDate(item.warranty_end),
        warranty_period_months: parseInteger(item.warranty_period_months),
        expiry_notification_days: parseInteger(item.expiry_notification_days),
        equipment_id: trimOrNull(item.equipment_id),
        asset_hierarchy: parseAssetHierarchy(item.asset_hierarchy),
        reminder_mode,
        reminder_frequency,
        reminder_interval,
        reminder_unit,
        reminder_weekdays,
        reminder_last_sent_on: parseDate(item.reminder_last_sent_on),
      }
      const lead = leadDaysForItem(base)
      let first = firstReminderDate(base.warranty_end, lead)
      if (reminder_mode === 'recurring' && reminder_frequency === 'weekly' && reminder_weekdays.length) {
        first = snapToWeekdays(first, reminder_weekdays)
      }
      let reminder_next_at = first
      if (reminder_mode === 'one_time') {
        reminder_next_at = base.reminder_last_sent_on ? null : first
      } else if (base.reminder_last_sent_on) {
        const existingNext = parseDate(item.reminder_next_at)
        if (existingNext && (!base.warranty_end || existingNext <= base.warranty_end)) {
          reminder_next_at = existingNext
        } else {
          reminder_next_at = advanceReminderDate(
            base.reminder_last_sent_on,
            reminder_frequency,
            base.warranty_end,
            reminderAdvanceOptions(base),
          )
        }
      }
      return {
        ...base,
        reminder_next_at,
      }
    })
    .filter(itemHasContent)
}

/** Build recipient id set from already-loaded rows (pure; for unit tests). */
export function collectWarrantyRecipientIds({
  createdByProfileId = null,
  departmentEmployeeProfileIds = [],
  adminProfileIds = [],
} = {}) {
  const ids = new Set()
  if (createdByProfileId) ids.add(createdByProfileId)
  for (const id of departmentEmployeeProfileIds || []) {
    if (id) ids.add(id)
  }
  if (!ids.size) {
    for (const id of adminProfileIds || []) {
      if (id) ids.add(id)
    }
  }
  return [...ids]
}
