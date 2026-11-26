import test from 'node:test'
import assert from 'node:assert/strict'
import { displayWorkOrderNumber } from './workOrderService.js'
import { SCHEDULED_WO_SOURCE } from './workOrderOrigin.js'

test('displayWorkOrderNumber keeps regular WO numbers', () => {
  assert.equal(
    displayWorkOrderNumber({ wo_number: 'WO-MEC-261125-0001', source_type: 'manual' }),
    'WO-MEC-261125-0001',
  )
})

test('displayWorkOrderNumber rewrites legacy WO prefix for scheduled work orders', () => {
  assert.equal(
    displayWorkOrderNumber({
      wo_number: 'WO-MEC-261125-0001',
      source_type: SCHEDULED_WO_SOURCE,
    }),
    'SCWO-MEC-261125-0001',
  )
})

test('displayWorkOrderNumber keeps SCWO prefix for scheduled work orders', () => {
  assert.equal(
    displayWorkOrderNumber({
      wo_number: 'SCWO-MEC-261125-0002',
      source_type: SCHEDULED_WO_SOURCE,
    }),
    'SCWO-MEC-261125-0002',
  )
})
