import test from 'node:test'
import assert from 'node:assert/strict'
import {
  firstFutureDateMessage,
  formatLocalDateTimeValue,
  isFutureLocalDateTime,
  parseLocalDateTime,
} from './dateConstraints.js'

test('parseLocalDateTime reads local datetime without zone', () => {
  const date = parseLocalDateTime('2026-11-14T18:07')
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 10)
  assert.equal(date.getDate(), 14)
  assert.equal(date.getHours(), 18)
  assert.equal(date.getMinutes(), 7)
})

test('isFutureLocalDateTime rejects future datetimes and allows past/present', () => {
  const now = new Date(2026, 10, 14, 18, 0, 0, 0)
  assert.equal(isFutureLocalDateTime('2026-11-14T17:59', now), false)
  assert.equal(isFutureLocalDateTime('2026-11-14T18:00', now), false)
  assert.equal(isFutureLocalDateTime('2026-11-14T18:01', now), true)
  assert.equal(isFutureLocalDateTime('2026-11-19T06:07', now), true)
  assert.equal(isFutureLocalDateTime('', now), false)
  assert.equal(isFutureLocalDateTime(null, now), false)
})

test('isFutureLocalDateTime treats date-only values by calendar day', () => {
  const now = new Date(2026, 10, 14, 18, 0, 0, 0)
  assert.equal(isFutureLocalDateTime('2026-11-14', now), false)
  assert.equal(isFutureLocalDateTime('2026-11-15', now), true)
  assert.equal(isFutureLocalDateTime('2026-11-13', now), false)
})

test('firstFutureDateMessage reports the first offending field', () => {
  const now = new Date(2026, 10, 14, 18, 0, 0, 0)
  assert.equal(
    firstFutureDateMessage([
      { label: 'Work start', value: '2026-11-14T17:00' },
      { label: 'Work end', value: '2026-11-19T06:07' },
    ], now),
    'Work end cannot be in the future.',
  )
  assert.equal(
    firstFutureDateMessage([
      { label: 'Work start', value: '2026-11-14T17:00' },
    ], now),
    null,
  )
})

test('formatLocalDateTimeValue matches DateField storage shape', () => {
  assert.equal(
    formatLocalDateTimeValue(new Date(2026, 10, 14, 18, 7)),
    '2026-11-14T18:07',
  )
})
