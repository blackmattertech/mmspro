import test from 'node:test'
import assert from 'node:assert/strict'
import {
  workRequestEffectiveStatusKeyFromColumns,
  tallyWorkRequestStatusCounts,
} from './workRequestStatusLabel.js'

test('workRequestEffectiveStatusKeyFromColumns mirrors SQL effective status', () => {
  assert.equal(workRequestEffectiveStatusKeyFromColumns('pending_approval', null), 'pending_approval')
  assert.equal(workRequestEffectiveStatusKeyFromColumns('approved', null), 'work_order_generated')
  assert.equal(workRequestEffectiveStatusKeyFromColumns('approved', 'created'), 'work_order_generated')
  assert.equal(workRequestEffectiveStatusKeyFromColumns('approved', 'assigned'), 'technician_assigned')
  assert.equal(workRequestEffectiveStatusKeyFromColumns('approved', 'completed'), 'completed')
})

test('tallyWorkRequestStatusCounts aggregates display keys', () => {
  const counts = tallyWorkRequestStatusCounts([
    { status: 'approved', execution_status: 'assigned' },
    { status: 'approved', execution_status: 'assigned' },
    { status: 'approved', execution_status: 'completed' },
    { status: 'pending_approval', execution_status: null },
  ])
  const map = Object.fromEntries(counts.map((row) => [row.status, row.count]))
  assert.equal(map.technician_assigned, 2)
  assert.equal(map.completed, 1)
  assert.equal(map.pending_approval, 1)
})
