import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isOrderFromSelectable,
  resolveOrderFromDepartmentId,
} from './workRequestService.js'

test('only org admins may select Order From', () => {
  assert.equal(isOrderFromSelectable(true), true)
  assert.equal(isOrderFromSelectable(false), false)
  assert.equal(isOrderFromSelectable(undefined), false)
})

test('non-admins are locked to their employee department', () => {
  assert.equal(
    resolveOrderFromDepartmentId({
      isOrgAdmin: false,
      employeeDepartmentId: 'dept-mine',
      requestedOrderFromId: 'dept-other',
    }),
    'dept-mine',
  )
  assert.equal(
    resolveOrderFromDepartmentId({
      isOrgAdmin: false,
      employeeDepartmentId: null,
      requestedOrderFromId: 'dept-other',
    }),
    null,
  )
})

test('org admins may choose Order From and still fall back to their department', () => {
  assert.equal(
    resolveOrderFromDepartmentId({
      isOrgAdmin: true,
      employeeDepartmentId: 'dept-mine',
      requestedOrderFromId: 'dept-other',
    }),
    'dept-other',
  )
  assert.equal(
    resolveOrderFromDepartmentId({
      isOrgAdmin: true,
      employeeDepartmentId: 'dept-mine',
      requestedOrderFromId: null,
    }),
    'dept-mine',
  )
  assert.equal(
    resolveOrderFromDepartmentId({
      isOrgAdmin: true,
      employeeDepartmentId: null,
      requestedOrderFromId: 'dept-picked',
    }),
    'dept-picked',
  )
})
