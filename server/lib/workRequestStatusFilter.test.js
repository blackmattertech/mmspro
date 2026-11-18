import test from 'node:test'
import assert from 'node:assert/strict'
import {
  partitionWorkRequestStatusFilters,
  applyWorkRequestDisplayStatusFilter,
} from './workRequestStatusFilter.js'

test('partitionWorkRequestStatusFilters splits request and execution keys', () => {
  const part = partitionWorkRequestStatusFilters([
    'pending_approval',
    'work_order_generated',
    'technician_assigned',
    'in_progress',
  ])
  assert.deepEqual(part.requestStatuses, ['pending_approval'])
  assert.deepEqual(part.executionStatuses, ['in_progress'])
  assert.equal(part.includeWorkOrderGenerated, true)
  assert.equal(part.includeTechnicianAssigned, true)
})

test('applyWorkRequestDisplayStatusFilter builds or() clauses', () => {
  const calls = []
  const query = {
    or(expr) {
      calls.push(expr)
      return this
    },
  }
  const { applied } = applyWorkRequestDisplayStatusFilter(query, [
    'submitted',
    'work_order_generated',
    'started',
  ])
  assert.equal(applied, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /status\.eq\.submitted/)
  assert.match(calls[0], /work_order_generated|execution_status\.in\.\(draft,created\)/)
  assert.match(calls[0], /execution_status\.eq\.started/)
})

test('applyWorkRequestDisplayStatusFilter no-ops on empty statuses', () => {
  const { applied } = applyWorkRequestDisplayStatusFilter({}, [])
  assert.equal(applied, false)
})
