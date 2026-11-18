import test from 'node:test'
import assert from 'node:assert/strict'
import {
  listMissingRequiredLayoutFields,
  missingRequiredLayoutValues,
} from './formFieldSources.js'

test('listMissingRequiredLayoutFields returns ids and labels for empty required fields', () => {
  const layout = {
    fields: [
      { id: 'system:short_description', required: true, label: 'Short description' },
      { id: 'system:remarks', required: true, label: 'Remarks' },
      { id: 'system:priority', required: false, label: 'Priority' },
    ],
  }
  const missing = listMissingRequiredLayoutFields(layout, {
    systemValues: { short_description: '', remarks: 'ok', priority: '' },
  })
  assert.deepEqual(missing, [
    { id: 'system:short_description', key: 'short_description', label: 'Short description' },
  ])
  assert.deepEqual(missingRequiredLayoutValues(layout, {
    systemValues: { short_description: '', remarks: 'ok' },
  }), ['Short description'])
})
