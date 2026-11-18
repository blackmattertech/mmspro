import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appearsOnAllWorkOrdersTab,
  appearsOnUnassignedTab,
  appearsOnAssignedToMeTab,
  appearsOnManualTab,
  isRequesterOnlyRelationship,
  orderToTabOrFilter,
} from './workOrderTabVisibility.js'

const orderToEmployee = {
  id: 'emp-to',
  department_id: 'dept-to',
  location_id: 'loc-1',
}

const orderFromEmployee = {
  id: 'emp-from',
  department_id: 'dept-from',
  location_id: 'loc-1',
}

const wrWo = {
  id: 'wo-1',
  source_type: 'approved_work_request',
  assigned_department_id: 'dept-to',
  assigned_location_id: 'loc-1',
  created_by: 'approver-profile',
  requester_id: 'requester-profile',
}

test('Order From requester does not see WR WO on any WO tab', () => {
  const assignees = []
  assert.equal(appearsOnAllWorkOrdersTab(orderFromEmployee, wrWo), false)
  assert.equal(appearsOnUnassignedTab(orderFromEmployee, wrWo, { assigneeCount: 0 }), false)
  assert.equal(
    appearsOnAssignedToMeTab(orderFromEmployee, wrWo, { assigneeEmployeeIds: assignees }),
    false,
  )
  assert.equal(
    appearsOnManualTab(orderFromEmployee, wrWo, {
      profileId: 'requester-profile',
      assigneeEmployeeIds: assignees,
    }),
    false,
  )
  assert.equal(
    isRequesterOnlyRelationship(wrWo, 'requester-profile', {
      assigneeEmployeeIds: assignees,
      employee: orderFromEmployee,
    }),
    true,
  )
})

test('Order To member sees unclaimed WO on All and Unassigned', () => {
  assert.equal(appearsOnAllWorkOrdersTab(orderToEmployee, wrWo), true)
  assert.equal(appearsOnUnassignedTab(orderToEmployee, wrWo, { assigneeCount: 0 }), true)
  assert.equal(
    appearsOnAssignedToMeTab(orderToEmployee, wrWo, { assigneeEmployeeIds: [] }),
    false,
  )
})

test('After claim, Order To member sees Assigned to Me and not Unassigned', () => {
  assert.equal(appearsOnAllWorkOrdersTab(orderToEmployee, wrWo), true)
  assert.equal(appearsOnUnassignedTab(orderToEmployee, wrWo, { assigneeCount: 1 }), false)
  assert.equal(
    appearsOnAssignedToMeTab(orderToEmployee, wrWo, { assigneeEmployeeIds: ['emp-to'] }),
    true,
  )
})

test('Location head sees other-dept WO at their location on All', () => {
  const head = { id: 'emp-head', department_id: 'dept-other', location_id: 'loc-1' }
  const otherDeptWo = { ...wrWo, assigned_department_id: 'dept-x' }
  assert.equal(appearsOnAllWorkOrdersTab(head, otherDeptWo, { isLocationHead: true }), true)
  assert.equal(appearsOnAllWorkOrdersTab(head, otherDeptWo, { isLocationHead: false }), false)
})

test('Manual tab requires created_by me AND assignee me', () => {
  const manual = {
    id: 'wo-m',
    source_type: 'manual',
    created_by: 'me',
    assigned_department_id: 'dept-to',
    assigned_location_id: 'loc-1',
  }
  assert.equal(
    appearsOnManualTab(orderToEmployee, manual, {
      profileId: 'me',
      assigneeEmployeeIds: ['emp-to'],
    }),
    true,
  )
  assert.equal(
    appearsOnManualTab(orderToEmployee, manual, {
      profileId: 'me',
      assigneeEmployeeIds: ['someone-else'],
    }),
    false,
  )
  assert.equal(
    appearsOnManualTab(orderToEmployee, manual, {
      profileId: 'other',
      assigneeEmployeeIds: ['emp-to'],
    }),
    false,
  )
})

test('PM scheduled never appears on All', () => {
  assert.equal(
    appearsOnAllWorkOrdersTab(orderToEmployee, { ...wrWo, source_type: 'preventive_maintenance' }),
    false,
  )
})

test('orderToTabOrFilter builds dept and location-head clauses', () => {
  const filter = orderToTabOrFilter(orderToEmployee, { isLocationHead: true })
  assert.match(filter, /assigned_department_id\.eq\.dept-to/)
  assert.match(filter, /assigned_location_id\.eq\.loc-1/)
})
