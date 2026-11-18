import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canClaimWorkOrderAssignment,
  canPatchDepartmentTechnicianAssignment,
  employeeMatchesDepartmentAssignment,
  isLocationOnlyPool,
  resolveAssignmentActionFlags,
} from './workOrderAssignmentActions.js'

const ORDER_TO_DEPT = 'dept-to'
const ORDER_FROM_DEPT = 'dept-from'
const LOC_A = 'loc-a'
const LOC_B = 'loc-b'

const orderToWo = {
  id: 'wo-1',
  status: 'assigned',
  work_request_id: 'wr-1',
  assigned_department_id: ORDER_TO_DEPT,
  assigned_location_id: LOC_A,
  assignees: [],
}

const locationOnlyWo = {
  id: 'wo-2',
  status: 'assigned',
  work_request_id: 'wr-2',
  assigned_department_id: null,
  assigned_location_id: LOC_A,
  assignees: [],
}

const orderToTech = {
  id: 'emp-to-tech',
  department_id: ORDER_TO_DEPT,
  location_id: LOC_A,
}

const orderToHead = {
  id: 'emp-to-head',
  department_id: ORDER_TO_DEPT,
  location_id: LOC_A,
}

const orderFromHead = {
  id: 'emp-from-head',
  department_id: ORDER_FROM_DEPT,
  location_id: LOC_A,
}

const orderFromTech = {
  id: 'emp-from-tech',
  department_id: ORDER_FROM_DEPT,
  location_id: LOC_A,
}

const otherLocationTech = {
  id: 'emp-other-loc',
  department_id: ORDER_TO_DEPT,
  location_id: LOC_B,
}

const locationTech = {
  id: 'emp-loc-tech',
  department_id: 'dept-other',
  location_id: LOC_A,
}

const headSession = {
  is_department_head: true,
  is_org_admin: false,
  permissions: [],
  disabled_modules: [],
}

const techSession = {
  is_department_head: false,
  is_org_admin: false,
  permissions: [],
  disabled_modules: [],
}

const adminSession = {
  is_department_head: false,
  is_org_admin: true,
  permissions: [],
  disabled_modules: [],
}

test('employeeMatchesDepartmentAssignment requires Order To dept and compatible location', () => {
  assert.equal(employeeMatchesDepartmentAssignment(orderToTech, orderToWo), true)
  assert.equal(employeeMatchesDepartmentAssignment(orderFromTech, orderToWo), false)
  assert.equal(employeeMatchesDepartmentAssignment(otherLocationTech, orderToWo), false)
  assert.equal(employeeMatchesDepartmentAssignment(orderToTech, locationOnlyWo), false)
})

test('isLocationOnlyPool is true only when WO has no dept and same location', () => {
  assert.equal(isLocationOnlyPool(locationTech, locationOnlyWo), true)
  assert.equal(isLocationOnlyPool(locationTech, orderToWo), false)
  assert.equal(isLocationOnlyPool(otherLocationTech, locationOnlyWo), false)
})

test('Order To technician can claim but not assign technicians', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderToTech,
    detail: orderToWo,
    session: techSession,
  })
  assert.equal(flags.can_claim_self, true)
  assert.equal(flags.can_assign_department_technicians, false)
  assert.equal(flags.can_reassign_as_location_head, false)
})

test('Order To department head can claim and assign technicians', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderToHead,
    detail: orderToWo,
    session: headSession,
  })
  assert.equal(flags.can_claim_self, true)
  assert.equal(flags.can_assign_department_technicians, true)
})

test('Order From employee cannot claim or assign', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderFromTech,
    detail: orderToWo,
    session: techSession,
  })
  assert.equal(flags.can_claim_self, false)
  assert.equal(flags.can_assign_department_technicians, false)
})

test('Order From department head cannot claim or assign (org-wide pool closed)', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderFromHead,
    detail: orderToWo,
    session: headSession,
  })
  assert.equal(flags.can_claim_self, false)
  assert.equal(flags.can_assign_department_technicians, false)
})

test('Location head flag is set only when marked head and at WO location', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderFromHead,
    detail: orderToWo,
    session: headSession,
    isLocationHead: true,
  })
  assert.equal(flags.can_reassign_as_location_head, true)
  // Still not Order To — no dept technician assign / claim
  assert.equal(flags.can_assign_department_technicians, false)
  assert.equal(flags.can_claim_self, false)
})

test('Location-only WO: location employees can claim; other locations cannot', () => {
  const local = resolveAssignmentActionFlags({
    employee: locationTech,
    detail: locationOnlyWo,
    session: techSession,
  })
  assert.equal(local.can_claim_self, true)
  assert.equal(local.can_assign_department_technicians, false)

  const remote = resolveAssignmentActionFlags({
    employee: otherLocationTech,
    detail: locationOnlyWo,
    session: techSession,
  })
  assert.equal(remote.can_claim_self, false)
})

test('Already-assignee cannot claim again', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderToTech,
    detail: { ...orderToWo, assignees: [{ id: orderToTech.id }] },
    session: techSession,
  })
  assert.equal(flags.can_claim_self, false)
})

test('Org admin can assign technicians into Order To department without being in that dept', () => {
  const flags = resolveAssignmentActionFlags({
    employee: orderFromHead,
    detail: orderToWo,
    session: adminSession,
  })
  assert.equal(flags.can_assign_department_technicians, true)
  assert.equal(flags.can_claim_self, false)
})

test('canClaimWorkOrderAssignment mirrors Order To / location-only rules', () => {
  assert.equal(canClaimWorkOrderAssignment(orderToTech, orderToWo), true)
  assert.equal(canClaimWorkOrderAssignment(orderFromHead, orderToWo), false)
  assert.equal(canClaimWorkOrderAssignment(locationTech, locationOnlyWo), true)
  assert.equal(canClaimWorkOrderAssignment(otherLocationTech, locationOnlyWo), false)
})

test('canPatchDepartmentTechnicianAssignment blocks Order From heads', () => {
  assert.equal(canPatchDepartmentTechnicianAssignment(orderToHead, orderToWo, headSession), true)
  assert.equal(canPatchDepartmentTechnicianAssignment(orderFromHead, orderToWo, headSession), false)
  assert.equal(canPatchDepartmentTechnicianAssignment(orderFromHead, orderToWo, adminSession), true)
  assert.equal(canPatchDepartmentTechnicianAssignment(orderToTech, orderToWo, techSession), false)
})
