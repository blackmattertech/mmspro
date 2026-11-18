import test from 'node:test'
import assert from 'node:assert/strict'
import { assertCloneChanged } from './recordClone.js'
import {
  cloneUniqueKeysFor,
  MANUAL_WO_CLONE_COMPARE_KEYS,
  MANUAL_WO_CLONE_UNIQUE_KEYS,
  TASK_CLONE_COMPARE_KEYS,
  TASK_CLONE_UNIQUE_KEYS,
  WARRANTY_CLONE_COMPARE_KEYS,
  WARRANTY_CLONE_UNIQUE_KEYS,
  WORK_REQUEST_CLONE_COMPARE_KEYS,
  WORK_REQUEST_CLONE_UNIQUE_KEYS,
  CHECKLIST_CLONE_COMPARE_KEYS,
  CHECKLIST_CLONE_SERVER_COMPARE_KEYS,
  CHECKLIST_CLONE_UNIQUE_KEYS,
  toChecklistCloneComparable,
  toManualWorkOrderCloneComparable,
  toTaskCloneComparable,
  toWarrantyCloneComparable,
  toWorkRequestCloneComparable,
} from './workRecordClone.js'

function check(toComparable, uniqueKeys, compareKeys, source, next) {
  const left = toComparable(source)
  return assertCloneChanged({
    source: left,
    next: toComparable(next),
    uniqueKeys: cloneUniqueKeysFor(left, uniqueKeys),
    compareKeys,
  })
}

const manualRow = {
  short_description: 'Pump leak',
  problem_description: 'Seal is leaking',
  priority: 'high',
  equipment_id: 'eq-1',
  assigned_department_id: 'dep-1',
  assignees: [{ id: 'e2' }, { id: 'e1' }],
  vendor_expense: '100.00',
}

test('manual WO: unchanged copy (row vs camelCase draft) is blocked', () => {
  const draft = {
    shortDescription: 'Pump leak',
    problemDescription: 'Seal is leaking',
    priority: 'high',
    equipmentId: 'eq-1',
    assignedDepartmentId: 'dep-1',
    assignedEmployeeIds: ['e1', 'e2'],
    vendorExpense: 100,
  }
  const result = check(
    toManualWorkOrderCloneComparable,
    MANUAL_WO_CLONE_UNIQUE_KEYS,
    MANUAL_WO_CLONE_COMPARE_KEYS,
    manualRow,
    draft,
  )
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unique_key')
})

test('manual WO: new short description alone is not enough', () => {
  const result = check(
    toManualWorkOrderCloneComparable,
    MANUAL_WO_CLONE_UNIQUE_KEYS,
    MANUAL_WO_CLONE_COMPARE_KEYS,
    manualRow,
    { ...manualRow, assigned_employee_ids: ['e1', 'e2'], short_description: 'Pump leak 2' },
  )
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unchanged')
})

test('manual WO: new short description plus another change passes', () => {
  const result = check(
    toManualWorkOrderCloneComparable,
    MANUAL_WO_CLONE_UNIQUE_KEYS,
    MANUAL_WO_CLONE_COMPARE_KEYS,
    manualRow,
    { ...manualRow, short_description: 'Pump leak 2', priority: 'low' },
  )
  assert.equal(result.ok, true)
})

test('work request: unique key only enforced when source has a short description', () => {
  assert.deepEqual(
    cloneUniqueKeysFor(toWorkRequestCloneComparable({ short_description: '' }), WORK_REQUEST_CLONE_UNIQUE_KEYS),
    [],
  )
  const source = { short_description: 'Broken fan', priority: 'medium', order_to_department_id: 'd1' }
  assert.equal(
    check(toWorkRequestCloneComparable, WORK_REQUEST_CLONE_UNIQUE_KEYS, WORK_REQUEST_CLONE_COMPARE_KEYS, source, { ...source }).ok,
    false,
  )
  assert.equal(
    check(
      toWorkRequestCloneComparable,
      WORK_REQUEST_CLONE_UNIQUE_KEYS,
      WORK_REQUEST_CLONE_COMPARE_KEYS,
      source,
      { ...source, short_description: 'Broken fan B', priority: 'high' },
    ).ok,
    true,
  )
})

test('task: normalizes times and id lists across row and form shapes', () => {
  const row = {
    title: 'Audit',
    start_time: '09:00:00',
    assignees: [{ id: 'b' }, { id: 'a' }],
    tags_list: [{ id: 't1' }],
  }
  const form = {
    title: 'Audit',
    start_time: '09:00',
    assignee_employee_ids: ['a', 'b'],
    tag_ids: ['t1'],
  }
  assert.deepEqual(toTaskCloneComparable(row), toTaskCloneComparable(form))
  assert.equal(
    check(toTaskCloneComparable, TASK_CLONE_UNIQUE_KEYS, TASK_CLONE_COMPARE_KEYS, row, form).ok,
    false,
  )
  assert.equal(
    check(toTaskCloneComparable, TASK_CLONE_UNIQUE_KEYS, TASK_CLONE_COMPARE_KEYS, row, { ...form, title: 'Audit 2', start_time: '10:00' }).ok,
    true,
  )
})

test('warranty: purchase_ref is only a unique key when source has PO / invoice', () => {
  const noRef = toWarrantyCloneComparable({ items: [{ product_name: 'Pump' }] })
  assert.deepEqual(cloneUniqueKeysFor(noRef, WARRANTY_CLONE_UNIQUE_KEYS), [])

  const source = { vendor_id: 'v1', items: [{ product_name: 'Pump', po_number: 'PO-1', invoice_number: 'INV-1', value: '10.00' }] }
  const same = { vendor_id: 'v1', items: [{ product_name: 'Pump', po_number: 'PO-1', invoice_number: 'INV-1', value: 10 }] }
  const unchanged = check(toWarrantyCloneComparable, WARRANTY_CLONE_UNIQUE_KEYS, WARRANTY_CLONE_COMPARE_KEYS, source, same)
  assert.equal(unchanged.ok, false)

  const next = { vendor_id: 'v1', items: [{ product_name: 'Pump 2', po_number: 'PO-2', invoice_number: 'INV-2', value: 10 }] }
  assert.equal(check(toWarrantyCloneComparable, WARRANTY_CLONE_UNIQUE_KEYS, WARRANTY_CLONE_COMPARE_KEYS, source, next).ok, true)
})

test('checklist: name must change; sections count as another detail', () => {
  const source = {
    name: 'Daily check',
    description: 'd',
    form_ids: ['pm.plan'],
    is_active: true,
    sections: [{ name: 'S1', fields: [{ name: 'Oil', field_type: 'checkbox', options: [], is_required: false }] }],
  }
  const sameName = { ...source, sections: [...source.sections, { name: 'S2', fields: [] }] }
  assert.equal(
    check(toChecklistCloneComparable, CHECKLIST_CLONE_UNIQUE_KEYS, CHECKLIST_CLONE_COMPARE_KEYS, source, sameName).reason,
    'unique_key',
  )
  const renamedOnly = { ...source, name: 'Daily check 2' }
  assert.equal(
    check(toChecklistCloneComparable, CHECKLIST_CLONE_UNIQUE_KEYS, CHECKLIST_CLONE_COMPARE_KEYS, source, renamedOnly).reason,
    'unchanged',
  )
  const renamedWithSection = { ...renamedOnly, sections: [...source.sections, { name: 'S2', fields: [] }] }
  assert.equal(
    check(toChecklistCloneComparable, CHECKLIST_CLONE_UNIQUE_KEYS, CHECKLIST_CLONE_COMPARE_KEYS, source, renamedWithSection).ok,
    true,
  )
  // Server only sees the template row, so a rename alone is enough there.
  assert.equal(
    check(toChecklistCloneComparable, CHECKLIST_CLONE_UNIQUE_KEYS, CHECKLIST_CLONE_SERVER_COMPARE_KEYS, source, renamedOnly).ok,
    true,
  )
})
