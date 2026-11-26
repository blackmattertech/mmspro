import test from 'node:test'
import assert from 'node:assert/strict'
import { filterReportColumns, isDynamicReportColumnId } from './reportConstants.js'

test('dynamic catalog column ids are recognized', () => {
  assert.equal(isDynamicReportColumnId('field:11111111-2222-3333-4444-555555555555'), true)
  assert.equal(isDynamicReportColumnId('equipment'), false)
  assert.equal(isDynamicReportColumnId('field:not-a-uuid'), false)
})

test('filterReportColumns keeps field:* catalog columns for work requests', () => {
  const fieldId = 'field:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const filtered = filterReportColumns('work_request', [
    'request_number',
    fieldId,
    'not_a_real_column',
    'equipment',
  ])
  assert.deepEqual(filtered, ['request_number', fieldId, 'equipment'])
})

test('filterReportColumns keeps field:* catalog columns for unified work orders', () => {
  const fieldId = 'field:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const filtered = filterReportColumns('unified', [
    'wo_number',
    fieldId,
    'equipment_type',
    'plant',
  ])
  assert.deepEqual(filtered, ['wo_number', fieldId, 'plant'])
})
