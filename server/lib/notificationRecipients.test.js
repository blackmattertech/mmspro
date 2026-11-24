import test from 'node:test'
import assert from 'node:assert/strict'
import { departmentProfileIds, mergeRecipientIds } from './notificationRecipients.js'

test('department recipients include every employee that has a login', () => {
  const rows = [
    { id: 'e1', profile_id: 'p1' },
    { id: 'e2', profile_id: 'p2' },
    { id: 'e3', profile_id: null },
    { id: 'e4', profile_id: 'p2' },
  ]
  assert.deepEqual(departmentProfileIds(rows), ['p1', 'p2'])
})

test('department recipients skip excluded employees such as assignees', () => {
  const rows = [
    { id: 'e1', profile_id: 'p1' },
    { id: 'e2', profile_id: 'p2' },
  ]
  assert.deepEqual(departmentProfileIds(rows, { excludeEmployeeIds: ['e2'] }), ['p1'])
})

test('department recipients tolerate empty input', () => {
  assert.deepEqual(departmentProfileIds(null), [])
  assert.deepEqual(departmentProfileIds([]), [])
})

test('merged recipients are deduplicated and exclude the actor', () => {
  const merged = mergeRecipientIds(
    [['p1', 'p2'], ['p2', 'p3'], null],
    { excludeUserIds: ['p1', null] },
  )
  assert.deepEqual(merged.sort(), ['p2', 'p3'])
})
