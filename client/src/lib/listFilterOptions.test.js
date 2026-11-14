import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkOrderFilterFields, buildWorkRequestFilterFields } from './listFilterOptions.js'

test('buildWorkOrderFilterFields uses masters for status/location and page rows for WO #', () => {
  const fields = buildWorkOrderFilterFields({
    pageRows: [
      { wo_number: 'WO-1', short_description: 'Pump leak', work_request_number: 'WR-9' },
      { wo_number: 'WO-2', summary: 'Valve', work_request_number: 'WR-9' },
    ],
    statusOptions: [{ value: 'assigned', label: 'Assigned' }],
    priorityOptions: [{ value: 'high', label: 'High' }],
    locations: [{ id: 'loc-1', name: 'Plant A' }],
    workCenters: [{ name: 'WC-1' }],
    employees: [{ name: 'Ada' }],
  })

  const byId = Object.fromEntries(fields.map((field) => [field.id, field]))
  assert.deepEqual(byId.status.options, [{ value: 'assigned', label: 'Assigned' }])
  assert.deepEqual(byId.location.options, [{ value: 'loc-1', label: 'Plant A' }])
  assert.equal(byId.wo_number.options.length, 2)
  assert.equal(byId.summary.options.length, 2)
  assert.equal(byId.work_request.options.length, 1)
  assert.equal(byId.assignee.options[0].value, 'Ada')
})

test('buildWorkOrderFilterFields keeps high-cardinality options empty without page rows', () => {
  const fields = buildWorkOrderFilterFields({
    pageRows: [],
    statusFallback: [{ value: 'draft', label: 'Draft' }],
    priorityOptions: [{ value: 'low', label: 'Low' }],
    locations: [],
    workCenters: [],
    employees: [],
  })
  const byId = Object.fromEntries(fields.map((field) => [field.id, field]))
  assert.equal(byId.wo_number.options.length, 0)
  assert.equal(byId.summary.options.length, 0)
  assert.deepEqual(byId.status.options, [{ value: 'draft', label: 'Draft' }])
})

test('buildWorkRequestFilterFields can omit status for drafts', () => {
  const withStatus = buildWorkRequestFilterFields({
    pageRows: [{ request_number: 'WR-1', short_description: 'Noise' }],
    departments: [{ name: 'Maint' }],
    priorityOptions: [{ value: 'high', label: 'High' }],
    statusOptions: [{ value: 'submitted', label: 'Submitted' }],
    includeStatus: true,
  })
  const withoutStatus = buildWorkRequestFilterFields({
    pageRows: [],
    departments: [],
    priorityOptions: [],
    statusOptions: [],
    includeStatus: false,
  })
  assert.ok(withStatus.some((field) => field.id === 'status'))
  assert.ok(!withoutStatus.some((field) => field.id === 'status'))
  assert.equal(withStatus.find((field) => field.id === 'wr_number').options.length, 1)
})
