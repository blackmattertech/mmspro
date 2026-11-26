import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceReminderDate,
  alertKeyForSend,
  firstReminderDate,
  initialReminderCursor,
  isReminderDueOn,
  leadDaysForItem,
  nextCursorAfterSend,
  normalizeReminderFrequency,
  normalizeReminderMode,
} from './warrantyReminderSchedule.js'
import {
  collectWarrantyRecipientIds,
  normalizeWarrantyItems,
} from './warrantyItemNormalize.js'

test('normalizeReminderMode defaults to one_time', () => {
  assert.equal(normalizeReminderMode(null), 'one_time')
  assert.equal(normalizeReminderMode('recurring'), 'recurring')
  assert.equal(normalizeReminderMode('OTHER'), 'one_time')
})

test('normalizeReminderFrequency only applies for recurring', () => {
  assert.equal(normalizeReminderFrequency('one_time', 'daily'), null)
  assert.equal(normalizeReminderFrequency('recurring', 'daily'), 'daily')
  assert.equal(normalizeReminderFrequency('recurring', 'custom'), 'custom')
  assert.equal(normalizeReminderFrequency('recurring', 'weird'), 'weekly')
})

test('firstReminderDate subtracts lead days', () => {
  assert.equal(firstReminderDate('2026-12-31', 30), '2026-12-01')
  assert.equal(firstReminderDate('2026-12-31', 0), '2026-12-31')
})

test('advanceReminderDate respects warranty_end bound', () => {
  assert.equal(advanceReminderDate('2026-12-01', 'daily', '2026-12-31'), '2026-12-02')
  assert.equal(advanceReminderDate('2026-12-01', 'weekly', '2026-12-31'), '2026-12-08')
  assert.equal(advanceReminderDate('2026-12-01', 'monthly', '2026-12-31'), null)
  assert.equal(advanceReminderDate('2026-12-30', 'daily', '2026-12-31'), '2026-12-31')
  assert.equal(advanceReminderDate('2026-12-31', 'daily', '2026-12-31'), null)
})

test('custom cadence advances by interval unit', () => {
  assert.equal(
    advanceReminderDate('2026-12-01', 'custom', '2026-12-31', { interval: 2, unit: 'days' }),
    '2026-12-03',
  )
  assert.equal(
    advanceReminderDate('2026-12-01', 'custom', '2026-12-31', { interval: 2, unit: 'weeks' }),
    '2026-12-15',
  )
})

test('weekly weekdays snap to selected day', () => {
  // 2026-12-01 is Tuesday (UTC). Next Monday is 2026-12-07.
  assert.equal(
    advanceReminderDate('2026-12-01', 'weekly', '2026-12-31', { weekdays: [1] }),
    '2026-12-07',
  )
})

test('one_time is due once inside the lead window', () => {
  const item = {
    warranty_end: '2026-12-31',
    expiry_notification_days: 7,
    reminder_mode: 'one_time',
  }
  assert.equal(isReminderDueOn(item, { today: '2026-12-20' }), false)
  assert.equal(isReminderDueOn(item, { today: '2026-12-24' }), true)
  assert.equal(isReminderDueOn(item, { today: '2026-12-31' }), true)
  assert.equal(isReminderDueOn({ ...item, reminder_last_sent_on: '2026-12-24' }, { today: '2026-12-25' }), false)
  assert.equal(isReminderDueOn(item, { today: '2027-01-01' }), false)
})

test('recurring advances until warranty_end and skips same-day re-send', () => {
  const item = {
    warranty_end: '2026-12-31',
    expiry_notification_days: 14,
    reminder_mode: 'recurring',
    reminder_frequency: 'weekly',
    reminder_next_at: '2026-12-17',
  }
  assert.equal(isReminderDueOn(item, { today: '2026-12-16' }), false)
  assert.equal(isReminderDueOn(item, { today: '2026-12-17' }), true)
  assert.equal(
    isReminderDueOn({ ...item, reminder_last_sent_on: '2026-12-17' }, { today: '2026-12-17' }),
    false,
  )

  const cursor = nextCursorAfterSend(item, '2026-12-17')
  assert.equal(cursor.reminder_last_sent_on, '2026-12-17')
  assert.equal(cursor.reminder_next_at, '2026-12-24')

  const last = nextCursorAfterSend({ ...item, reminder_frequency: 'daily' }, '2026-12-31')
  assert.equal(last.reminder_next_at, null)
})

test('leadDaysForItem falls back to org default then 7', () => {
  assert.equal(leadDaysForItem({ expiry_notification_days: 15 }), 15)
  assert.equal(leadDaysForItem({}, { expiry_notification_days: 45 }), 45)
  assert.equal(leadDaysForItem({}, {}, 30), 30)
  assert.equal(leadDaysForItem({}, {}, null), 7)
})

test('initialReminderCursor seeds first alert day', () => {
  const cursor = initialReminderCursor({
    warranty_end: '2026-12-31',
    expiry_notification_days: 10,
    reminder_mode: 'one_time',
  })
  assert.equal(cursor.reminder_next_at, '2026-12-21')
})

test('alertKeyForSend is end-based for one_time and day-based for recurring', () => {
  assert.equal(
    alertKeyForSend('w1', 'i1', { mode: 'one_time', warrantyEnd: '2026-12-31', today: '2026-12-20' }),
    'w1:i1:2026-12-31',
  )
  assert.equal(
    alertKeyForSend('w1', 'i1', { mode: 'recurring', warrantyEnd: '2026-12-31', today: '2026-12-20' }),
    'w1:i1:2026-12-20',
  )
})

test('normalizeWarrantyItems persists equipment + reminder fields', () => {
  const [item] = normalizeWarrantyItems([{
    product_name: 'Pump',
    warranty_end: '2026-12-31',
    expiry_notification_days: '30',
    equipment_id: 'eq-1',
    asset_hierarchy: [{ field_id: 'f1', field_name: 'Area', value: 'A1' }],
    reminder_mode: 'recurring',
    reminder_frequency: 'monthly',
  }])
  assert.equal(item.equipment_id, 'eq-1')
  assert.equal(item.reminder_mode, 'recurring')
  assert.equal(item.reminder_frequency, 'monthly')
  assert.equal(item.expiry_notification_days, 30)
  assert.equal(item.reminder_next_at, '2026-12-01')
  assert.equal(item.asset_hierarchy.length, 1)
})

test('normalizeWarrantyItems keeps custom interval and weekdays', () => {
  const [custom] = normalizeWarrantyItems([{
    product_name: 'Fan',
    warranty_end: '2026-12-31',
    reminder_mode: 'recurring',
    reminder_frequency: 'custom',
    reminder_interval: '2',
    reminder_unit: 'days',
  }])
  assert.equal(custom.reminder_frequency, 'custom')
  assert.equal(custom.reminder_interval, 2)
  assert.equal(custom.reminder_unit, 'days')

  const [weekly] = normalizeWarrantyItems([{
    product_name: 'Motor',
    warranty_end: '2026-12-31',
    reminder_mode: 'recurring',
    reminder_frequency: 'weekly',
    reminder_weekdays: [1, 8, '3'],
  }])
  assert.deepEqual(weekly.reminder_weekdays, [1, 3])
})

test('normalizeWarrantyItems keeps legacy one_time when mode omitted', () => {
  const [item] = normalizeWarrantyItems([{
    product_name: 'Motor',
    warranty_end: '2026-06-30',
    expiry_notification_days: 7,
  }])
  assert.equal(item.reminder_mode, 'one_time')
  assert.equal(item.reminder_frequency, null)
  assert.equal(item.reminder_next_at, '2026-06-23')
})

test('collectWarrantyRecipientIds prefers creator+dept and falls back to admins', () => {
  assert.deepEqual(
    collectWarrantyRecipientIds({
      createdByProfileId: 'creator',
      departmentEmployeeProfileIds: ['a', 'b', 'a'],
      adminProfileIds: ['admin'],
    }).sort(),
    ['a', 'b', 'creator'],
  )
  assert.deepEqual(
    collectWarrantyRecipientIds({
      departmentEmployeeProfileIds: [],
      adminProfileIds: ['admin1', 'admin2'],
    }).sort(),
    ['admin1', 'admin2'],
  )
})
