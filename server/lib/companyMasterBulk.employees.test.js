import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEmployeeManagerRef } from './companyMasterBulkService.js'

const employees = [
  { id: 'm1', emp_id: 'EMP-001', name: 'Ada Manager' },
  { id: 'e2', emp_id: 'EMP-002', name: 'Bob Worker' },
  { id: 'e3', emp_id: 'EMP-003', name: 'Ada Manager' },
]

test('resolveEmployeeManagerRef matches Employee ID and dropdown labels', () => {
  assert.equal(resolveEmployeeManagerRef('EMP-001', employees), 'm1')
  assert.equal(resolveEmployeeManagerRef('EMP-001 — Ada Manager', employees), 'm1')
  assert.equal(resolveEmployeeManagerRef('Bob Worker', employees), 'e2')
  assert.equal(resolveEmployeeManagerRef('', employees), null)
})

test('resolveEmployeeManagerRef rejects self and ambiguous names', () => {
  assert.throws(
    () => resolveEmployeeManagerRef('EMP-002', employees, { selfEmpId: 'EMP-002' }),
    /own manager/,
  )
  assert.throws(
    () => resolveEmployeeManagerRef('Ada Manager', employees),
    /more than one employee/,
  )
  assert.throws(
    () => resolveEmployeeManagerRef('EMP-999', employees),
    /Unknown manager/,
  )
})
