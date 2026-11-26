import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogParentFields,
  matchesCatalogFilters,
  parseCatalogFilters,
  stripPrivateReportKeys,
} from './reportCatalogEnrichment.js'
import { orderedReportColumns } from './reportCsv.js'
import { columnsForReport } from './reportConstants.js'

test('parseCatalogFilters accepts JSON string and field: prefixes', () => {
  const fieldId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  assert.deepEqual(parseCatalogFilters({ [fieldId]: 'Pump' }), { [fieldId]: 'Pump' })
  assert.deepEqual(
    parseCatalogFilters(JSON.stringify({ [`field:${fieldId}`]: ' Pump ' })),
    { [fieldId]: 'Pump' },
  )
  assert.deepEqual(parseCatalogFilters('not-json'), {})
  assert.deepEqual(parseCatalogFilters(null), {})
})

test('matchesCatalogFilters requires every selected parent value', () => {
  const fieldId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const values = new Map([
    ['eq-1', { [fieldId]: 'C-shed Cabin' }],
    ['eq-2', { [fieldId]: 'Other' }],
  ])
  assert.equal(matchesCatalogFilters('eq-1', values, { [fieldId]: 'C-shed Cabin' }), true)
  assert.equal(matchesCatalogFilters('eq-2', values, { [fieldId]: 'C-shed Cabin' }), false)
  assert.equal(matchesCatalogFilters(null, values, { [fieldId]: 'C-shed Cabin' }), false)
  assert.equal(matchesCatalogFilters('eq-1', values, {}), true)
})

test('catalogParentFields keeps only active non-file parents', () => {
  const parents = catalogParentFields([
    { id: '1', name: 'Location', kind: 'parent' },
    { id: '2', name: 'Photo', kind: 'parent', field_type: 'image' },
    { id: '3', name: 'Child', kind: 'child' },
    { id: '4', name: 'Inactive', kind: 'parent', is_active: false },
    { id: '5', name: 'Name', kind: 'parent', field_type: 'text' },
  ])
  assert.deepEqual(parents.map((row) => row.id), ['1', '5'])
})

test('stripPrivateReportKeys removes internals used during enrichment', () => {
  const row = stripPrivateReportKeys({
    wo_number: 'WO-1',
    _equipment_id: 'eq-1',
    field_values: { a: 'b' },
    'field:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': 'Cabin',
  }, ['_equipment_id'])
  assert.equal(row.wo_number, 'WO-1')
  assert.equal(row['field:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'], 'Cabin')
  assert.equal(row._equipment_id, undefined)
  assert.equal(row.field_values, undefined)
})

test('unified report columns no longer include hardcoded asset role fields', () => {
  const ids = columnsForReport('unified').map((col) => col.id)
  assert.equal(ids.includes('area'), false)
  assert.equal(ids.includes('equipment_type'), false)
  assert.equal(ids.includes('equipment_capacity'), false)
  assert.equal(ids.includes('equipment_tag'), false)
  assert.equal(ids.includes('equipment'), true)
  assert.equal(ids.includes('plant'), true)
})

test('orderedReportColumns keeps field:* when extraDefs provide labels', () => {
  const fieldId = 'field:11111111-2222-3333-4444-555555555555'
  const defs = orderedReportColumns('unified', ['wo_number', fieldId], [
    { id: fieldId, label: 'Equipment Location' },
  ])
  assert.deepEqual(defs.map((col) => col.id), ['wo_number', fieldId])
  assert.equal(defs[1].label, 'Equipment Location')
})
