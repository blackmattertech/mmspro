import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeNextDueDate,
  isRecurringPlan,
  nextDueAfterGenerate,
} from './pmSchedule.js'

describe('computeNextDueDate', () => {
  it('advances daily by every_n days', () => {
    assert.equal(
      computeNextDueDate({ schedule_type: 'calendar', calendar_unit: 'day', every_n: 1 }, '2026-03-10'),
      '2026-03-11',
    )
    assert.equal(
      computeNextDueDate({ schedule_type: 'calendar', calendar_unit: 'day', every_n: 3 }, '2026-03-10'),
      '2026-03-13',
    )
  })

  it('advances weekly by every_n weeks', () => {
    assert.equal(
      computeNextDueDate({ schedule_type: 'calendar', calendar_unit: 'week', every_n: 1 }, '2026-03-10'),
      '2026-03-17',
    )
  })

  it('advances monthly by every_n months', () => {
    assert.equal(
      computeNextDueDate({ schedule_type: 'calendar', calendar_unit: 'month', every_n: 1 }, '2026-01-31'),
      '2026-02-28',
    )
    assert.equal(
      computeNextDueDate({ schedule_type: 'calendar', calendar_unit: 'month', every_n: 2 }, '2026-01-15'),
      '2026-03-15',
    )
  })

  it('returns null past end_date when never_ends is false', () => {
    assert.equal(
      computeNextDueDate({
        schedule_type: 'calendar',
        calendar_unit: 'day',
        every_n: 1,
        end_date: '2026-03-10',
        never_ends: false,
      }, '2026-03-10'),
      null,
    )
  })
})

describe('nextDueAfterGenerate', () => {
  const calendarPlan = {
    schedule_type: 'calendar',
    calendar_unit: 'day',
    every_n: 1,
    next_due_at: '2026-03-10',
    never_ends: true,
  }

  it('clears due for one-time plans', () => {
    assert.equal(
      nextDueAfterGenerate({ ...calendarPlan, is_recurring: false, allow_multiple_open: false }),
      null,
    )
  })

  it('advances due for recurring calendar plans with allow_multiple_open', () => {
    assert.equal(
      nextDueAfterGenerate({ ...calendarPlan, is_recurring: true, allow_multiple_open: true }),
      '2026-03-11',
    )
  })

  it('leaves due unchanged for legacy close-gated recurring plans', () => {
    assert.equal(
      nextDueAfterGenerate({ ...calendarPlan, is_recurring: true, allow_multiple_open: false }),
      '2026-03-10',
    )
  })

  it('clears due for recurring reading-only with allow_multiple_open', () => {
    assert.equal(
      nextDueAfterGenerate({
        schedule_type: 'reading',
        is_recurring: true,
        allow_multiple_open: true,
        next_due_at: '2026-03-10',
      }),
      null,
    )
  })

  it('treats missing is_recurring as recurring', () => {
    assert.equal(isRecurringPlan({}), true)
    assert.equal(isRecurringPlan({ is_recurring: false }), false)
  })
})
