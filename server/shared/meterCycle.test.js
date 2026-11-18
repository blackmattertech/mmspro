import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  annotateMeterCycle,
  canResetMeter,
  cumulativeFromOffset,
  resetCycleOffset,
} from './meterCycle.js'

describe('meter cycle cumulative reading', () => {
  it('keeps cumulative equal to the face value before any reset', () => {
    const cycle = annotateMeterCycle([
      { id: 'a', reading: 10000, reading_at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', reading: 100000, reading_at: '2026-02-01T00:00:00.000Z' },
    ])

    assert.equal(cycle.last_reading, 100000)
    assert.equal(cycle.cumulative_reading, 100000)
    assert.deepEqual(
      cycle.readings.map((row) => row.cumulative_reading),
      [10000, 100000],
    )
  })

  it('starts the face at 0 after a reset and keeps adding onto the closed total', () => {
    const cycle = annotateMeterCycle([
      { id: 'a', reading: 100000, reading_at: '2026-02-01T00:00:00.000Z', is_reset: false },
      { id: 'reset', reading: 0, reading_at: '2026-02-02T00:00:00.000Z', is_reset: true },
      { id: 'b', reading: 0, reading_at: '2026-02-03T00:00:00.000Z', is_reset: false },
      { id: 'c', reading: 500, reading_at: '2026-02-04T00:00:00.000Z', is_reset: false },
    ])

    assert.equal(cycle.meter_reading_offset, 100000)
    assert.equal(cycle.last_reading, 500)
    assert.equal(cycle.cumulative_reading, 100500)
    assert.deepEqual(
      cycle.readings.map((row) => ({
        reading: row.reading,
        cumulative: row.cumulative_reading,
        reset: row.is_reset,
      })),
      [
        { reading: 100000, cumulative: 100000, reset: false },
        { reading: 0, cumulative: 100000, reset: true },
        { reading: 0, cumulative: 100000, reset: false },
        { reading: 500, cumulative: 100500, reset: false },
      ],
    )
  })

  it('adds a second reset onto the previous cumulative total', () => {
    const cycle = annotateMeterCycle([
      { id: 'a', reading: 100000, reading_at: '2026-01-01T00:00:00.000Z' },
      { id: 'r1', reading: 0, reading_at: '2026-01-02T00:00:00.000Z', is_reset: true },
      { id: 'b', reading: 40000, reading_at: '2026-02-01T00:00:00.000Z' },
      { id: 'r2', reading: 0, reading_at: '2026-02-02T00:00:00.000Z', is_reset: true },
      { id: 'c', reading: 10, reading_at: '2026-03-01T00:00:00.000Z' },
    ])

    assert.equal(cycle.last_reading, 10)
    assert.equal(cycle.cumulative_reading, 140010)
    assert.equal(cycle.readings[3].cumulative_reading, 140000)
  })

  it('drops the carry-forward when the reset row is removed', () => {
    const cycle = annotateMeterCycle([
      { id: 'a', reading: 100000, reading_at: '2026-02-01T00:00:00.000Z' },
      { id: 'c', reading: 500, reading_at: '2026-02-04T00:00:00.000Z' },
    ])

    assert.equal(cycle.last_reading, 500)
    assert.equal(cycle.cumulative_reading, 500)
  })

  it('orders readings by time before applying a reset', () => {
    const cycle = annotateMeterCycle([
      { id: 'c', reading: 250, reading_at: '2026-03-01T00:00:00.000Z' },
      { id: 'reset', reading: 0, reading_at: '2026-02-01T00:00:00.000Z', is_reset: true },
      { id: 'a', reading: 100000, reading_at: '2026-01-01T00:00:00.000Z' },
    ])

    assert.equal(cycle.cumulative_reading, 100250)
    assert.deepEqual(cycle.readings.map((row) => row.id), ['a', 'reset', 'c'])
  })

  it('refuses a reset when the meter is already at 0 or has no reading', () => {
    assert.equal(canResetMeter(null), false)
    assert.equal(canResetMeter(0), false)
    assert.equal(canResetMeter(100000), true)
    assert.equal(resetCycleOffset(0, 100000), 100000)
    assert.equal(resetCycleOffset(100000, 40000), 140000)
    assert.equal(resetCycleOffset(100000, 0), null)
    assert.equal(cumulativeFromOffset(100000, 500), 100500)
  })
})
