import test from 'node:test'
import assert from 'node:assert/strict'
import { assigneeIdsForUserSelfRequest } from './workOrderService.js'

test('user self request assigns the creator when nobody else is chosen', () => {
  assert.deepEqual(
    assigneeIdsForUserSelfRequest('user_self', [], 'emp-1'),
    ['emp-1'],
  )
})

test('user self request keeps an explicit technician selection', () => {
  assert.deepEqual(
    assigneeIdsForUserSelfRequest('user_self', ['emp-2', 'emp-2'], 'emp-1'),
    ['emp-2'],
  )
})

test('other request types stay unassigned when no technicians are chosen', () => {
  assert.deepEqual(
    assigneeIdsForUserSelfRequest('intra_department', [], 'emp-1'),
    [],
  )
  assert.deepEqual(
    assigneeIdsForUserSelfRequest('inter_department', ['emp-3'], 'emp-1'),
    ['emp-3'],
  )
})

test('user self request without a linked employee stays unassigned', () => {
  assert.deepEqual(
    assigneeIdsForUserSelfRequest('user_self', [null, ''], null),
    [],
  )
})
