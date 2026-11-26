import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MANUAL_WO_SOURCE,
  SCHEDULED_WO_SOURCE,
  isManualOriginWorkOrder,
  isScheduledWorkOrder,
  excludeScheduledWorkOrders,
  onlyManualOriginWorkOrders,
  canEditWorkOrderContent,
  isWorkOrderAdminOnlyStatus,
} from './workOrderOrigin.js'

test('isManualOriginWorkOrder accepts only source_type=manual', () => {
  assert.equal(isManualOriginWorkOrder({ source_type: 'manual' }), true)
  assert.equal(isManualOriginWorkOrder({ source_type: 'approved_work_request' }), false)
  assert.equal(isManualOriginWorkOrder({ source_type: 'user_self_request' }), false)
  assert.equal(isManualOriginWorkOrder({ source_type: SCHEDULED_WO_SOURCE }), false)
  assert.equal(isManualOriginWorkOrder({ source_type: null }), false)
  assert.equal(isManualOriginWorkOrder(null), false)
})

test('isScheduledWorkOrder detects preventive_maintenance', () => {
  assert.equal(isScheduledWorkOrder({ source_type: SCHEDULED_WO_SOURCE }), true)
  assert.equal(isScheduledWorkOrder({ source_type: MANUAL_WO_SOURCE }), false)
})

test('query helpers apply the expected source_type filters', () => {
  const calls = []
  const query = {
    neq(...args) {
      calls.push(['neq', ...args])
      return this
    },
    eq(...args) {
      calls.push(['eq', ...args])
      return this
    },
  }

  excludeScheduledWorkOrders(query)
  onlyManualOriginWorkOrders(query)

  assert.deepEqual(calls, [
    ['neq', 'source_type', SCHEDULED_WO_SOURCE],
    ['eq', 'source_type', MANUAL_WO_SOURCE],
  ])
})

test('completed work orders are editable only by company admin', () => {
  assert.equal(isWorkOrderAdminOnlyStatus('completed'), true)
  assert.equal(isWorkOrderAdminOnlyStatus('verified'), true)
  assert.equal(isWorkOrderAdminOnlyStatus('closed'), true)
  assert.equal(isWorkOrderAdminOnlyStatus('in_progress'), false)

  assert.equal(canEditWorkOrderContent({ status: 'in_progress', isOrgAdmin: false }), true)
  assert.equal(canEditWorkOrderContent({ status: 'completed', isOrgAdmin: false }), false)
  assert.equal(canEditWorkOrderContent({ status: 'completed', isOrgAdmin: true }), true)
  assert.equal(canEditWorkOrderContent({ status: 'verified', isOrgAdmin: false }), false)
  assert.equal(canEditWorkOrderContent({ status: 'closed', isOrgAdmin: true }), true)
})
