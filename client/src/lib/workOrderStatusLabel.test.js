import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWorkOrderStatusLabel } from './workOrderStatusLabel.js'

test('assigned with no technicians is technician assignment pending', () => {
  assert.equal(
    formatWorkOrderStatusLabel({ status: 'assigned', assignees: [] }),
    'Technician assignment pending',
  )
  assert.equal(
    formatWorkOrderStatusLabel({ status: 'assigned' }),
    'Technician assignment pending',
  )
})

test('assigned with technicians is technician assigned', () => {
  assert.equal(
    formatWorkOrderStatusLabel({
      status: 'assigned',
      assignees: [{ id: 'e1', name: 'Ada' }],
    }),
    'Technician assigned',
  )
})

test('other statuses use fallback or org labels', () => {
  assert.equal(formatWorkOrderStatusLabel('accepted'), 'Accepted')
  assert.equal(
    formatWorkOrderStatusLabel('completed', { completed: 'Done' }),
    'Done',
  )
})
