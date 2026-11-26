import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWarrantyReminderLabel } from './warrantyReminderLabel.js'

test('formats one-time reminder with lead days', () => {
  assert.equal(
    formatWarrantyReminderLabel({ reminder_mode: 'one_time', expiry_notification_days: 30 }),
    'One-time · 30 days before',
  )
})

test('formats custom and weekday recurring reminders', () => {
  assert.equal(
    formatWarrantyReminderLabel({
      reminder_mode: 'recurring',
      reminder_frequency: 'custom',
      reminder_interval: 2,
      reminder_unit: 'days',
      expiry_notification_days: 15,
      reminder_next_at: '2026-12-01',
    }),
    'Every 2 days until expiry · starts 15 days before · next 2026-12-01',
  )
  assert.equal(
    formatWarrantyReminderLabel({
      reminder_mode: 'recurring',
      reminder_frequency: 'weekly',
      reminder_weekdays: [1],
    }),
    'Weekly (Mon) until expiry',
  )
})
