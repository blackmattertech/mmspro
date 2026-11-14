import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCalendarDate,
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayDateValue,
  formatDisplayTime,
  parseToIsoDate,
} from './displayDate.js'

test('formatDisplayDate prints DD-MMM-YYYY from a calendar date', () => {
  assert.equal(formatDisplayDate('2026-11-13'), '13-Nov-2026')
  assert.equal(formatDisplayDate('2026-01-05'), '05-Jan-2026')
  assert.equal(formatDisplayDate('13-Nov-2026'), '13-Nov-2026')
  assert.equal(formatDisplayDate(''), '')
  assert.equal(formatDisplayDate(null), '')
  assert.equal(formatDisplayDate('2026-02-31'), '')
})

test('formatDisplayDate uses the timestamp calendar day in the requested zone', () => {
  assert.equal(formatDisplayDate('2026-11-13T18:30:00.000Z', { utc: true }), '13-Nov-2026')
  assert.equal(formatDisplayDate(new Date(2026, 10, 13, 9, 5)), '13-Nov-2026')
})

test('formatCalendarDate keeps the stored calendar day', () => {
  assert.equal(formatCalendarDate('2026-11-13T00:00:00.000Z'), '13-Nov-2026')
  assert.equal(formatCalendarDate('2026-01-05'), '05-Jan-2026')
})

test('formatDisplayDateTime keeps date-only values date-only and adds HH:mm otherwise', () => {
  assert.equal(formatDisplayDateTime('2026-11-13'), '13-Nov-2026')
  assert.equal(formatDisplayDateTime('2026-11-13T18:30:00.000Z', { utc: true }), '13-Nov-2026 18:30')
  assert.equal(formatDisplayDateTime(new Date(2026, 10, 13, 9, 5)), '13-Nov-2026 09:05')
  assert.equal(formatDisplayDateTime('13-Nov-2026 09:05'), '13-Nov-2026 09:05')
})

test('formatDisplayTime prints HH:mm', () => {
  assert.equal(formatDisplayTime(new Date(2026, 10, 13, 9, 5)), '09:05')
  assert.equal(formatDisplayTime('not-a-date'), '')
})

test('formatDisplayDateValue only rewrites ISO dates', () => {
  assert.equal(formatDisplayDateValue('2026-11-13'), '13-Nov-2026')
  assert.equal(formatDisplayDateValue('2026-11-13T18:30:00.000Z', { utc: true }), '13-Nov-2026 18:30')
  assert.equal(formatDisplayDateValue('WO-100'), 'WO-100')
  assert.equal(formatDisplayDateValue(12), 12)
})

test('parseToIsoDate accepts storage and display dates', () => {
  assert.equal(parseToIsoDate('2026-01-15'), '2026-01-15')
  assert.equal(parseToIsoDate('2026-01-15T00:00:00.000Z'), '2026-01-15')
  assert.equal(parseToIsoDate('15/01/2026'), '2026-01-15')
  assert.equal(parseToIsoDate('15-01-2026'), '2026-01-15')
  assert.equal(parseToIsoDate('15-Jan-2026'), '2026-01-15')
  assert.equal(parseToIsoDate('31/02/2026'), null)
  assert.equal(parseToIsoDate(''), null)
})
