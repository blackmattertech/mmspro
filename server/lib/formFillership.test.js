import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canChangeWorkOrderStatus,
  canEditWorkOrderStatusProgressRemarks,
  canEditWorkOrderSupervisorStatus,
  resolveFormActors,
} from './formFillership.js'

const orderToDept = 'dept-order-to'
const assigneeId = 'emp-tech-1'

function actorsFor({
  profileId = 'profile-1',
  employeeId = 'emp-other',
  isDepartmentHead = false,
  canApproveIncoming = false,
  isOrgAdmin = false,
  isSupervisor = false,
  requesterId = 'profile-requester',
  assigneeIds = [assigneeId],
} = {}) {
  return resolveFormActors({
    formId: 'work_orders.manual',
    isOrgAdmin,
    profileId,
    employeeId,
    isDepartmentHead,
    employeeDepartmentId: orderToDept,
    canApproveIncoming,
    isSupervisor,
    record: {
      requested_by: requesterId,
      created_by: 'profile-approver',
      assigned_department_id: orderToDept,
      order_to_department_id: orderToDept,
      assignees: assigneeIds.map((id) => ({ id })),
    },
  })
}

test('work-request creator cannot edit WO status, progress, or remarks', () => {
  const actors = actorsFor({
    profileId: 'profile-requester',
    employeeId: 'emp-requester',
    isDepartmentHead: false,
  })
  assert.equal(actors.isCreator, true)
  assert.equal(actors.isTechnician, false)
  assert.equal(actors.isOrderToDeptHead, false)
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), false)
  assert.equal(canChangeWorkOrderStatus(actors, 'in_progress'), false)
})

test('assigned technician can edit WO status, progress, and remarks', () => {
  const actors = actorsFor({ employeeId: assigneeId })
  assert.equal(actors.isTechnician, true)
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'in_progress'), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'verified'), false)
})

test('order-to department head can edit WO status, progress, and remarks', () => {
  const actors = actorsFor({
    employeeId: 'emp-head',
    isDepartmentHead: true,
  })
  assert.equal(actors.isOrderToDeptHead, true)
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'completed'), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'closed'), true)
})

test('order-to approver without head flag can still drive lifecycle when canApproveIncoming', () => {
  const actors = actorsFor({
    employeeId: 'emp-approver',
    canApproveIncoming: true,
  })
  assert.equal(actors.isOrderToDeptHead, true)
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), true)
})

test('supervisor can verify or close but not set progress without assignee/order-to role', () => {
  const actors = actorsFor({
    employeeId: 'emp-supervisor',
    isSupervisor: true,
  })
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), false)
  assert.equal(canEditWorkOrderSupervisorStatus(actors), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'verified'), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'in_progress'), false)
})

test('org admin can edit status, progress, remarks, and closeout', () => {
  const actors = actorsFor({ isOrgAdmin: true, employeeId: 'emp-admin' })
  assert.equal(canEditWorkOrderStatusProgressRemarks(actors), true)
  assert.equal(canEditWorkOrderSupervisorStatus(actors), true)
  assert.equal(canChangeWorkOrderStatus(actors, 'closed'), true)
})
