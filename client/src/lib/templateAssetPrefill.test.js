import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogId } from './formLayoutIds.js'
import { templateAssetFieldValues } from './recordTemplates.js'
import {
  equipmentFieldValue,
  mergeBlankHierarchyValues,
} from './workRequestAssetPicker.js'

test('template asset values map catalog fields and let the equipment win', () => {
  const locationId = '11111111-1111-1111-1111-111111111111'
  const values = templateAssetFieldValues({
    form_values: {
      [catalogId(locationId)]: 'From layout',
      'field:22222222-2222-2222-2222-222222222222': 'Name from layout',
      note: 'not a catalog field',
      photo: { files: [] },
    },
    asset_field_values: {
      [locationId]: 'Admin',
    },
  })
  assert.equal(values[locationId], 'Admin')
  assert.equal(values['22222222-2222-2222-2222-222222222222'], 'Name from layout')
  assert.equal(values.note, undefined)
  assert.equal(values.photo, undefined)
})

test('equipment field value reads detail field_values when the catalog map is empty', () => {
  const field = { id: 'loc', name: 'Equipment Location', field_type: 'dropdown' }
  const row = {
    id: 'eq-1',
    code: 'ELEDB-10',
    values: {},
    field_values: [{ field_id: 'loc', value_text: 'Admin' }],
  }
  assert.equal(equipmentFieldValue(row, field), 'Admin')
})

test('blank hierarchy merge keeps a template location and fills missing levels', () => {
  const current = { loc: 'Admin' }
  const seeded = { loc: 'Other', name: 'ELEDB-10' }
  const merged = mergeBlankHierarchyValues(current, seeded, [])
  assert.deepEqual(merged, { loc: 'Admin', name: 'ELEDB-10' })
  assert.equal(mergeBlankHierarchyValues(merged, seeded, ['name']), merged)
})
