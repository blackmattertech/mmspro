import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUomSelectOptions, resolveUomValue, uomOptionLabel } from './uomOptions.js'

test('uomOptionLabel shows the code and name together', () => {
  assert.equal(uomOptionLabel({ code: 'KG', name: 'Kilogram' }), 'KG — Kilogram')
  assert.equal(uomOptionLabel({ code: 'NOS', name: 'NOS' }), 'NOS')
})

test('buildUomSelectOptions hides inactive units and keeps a legacy value', () => {
  const options = buildUomSelectOptions(
    [
      { code: 'KG', name: 'Kilogram', is_active: true },
      { code: 'ML', name: 'Millilitre', is_active: false },
      { code: 'NOS', name: 'Numbers', is_active: true },
    ],
    'Drum',
  )
  assert.deepEqual(options.map((option) => option.value), ['Drum', 'KG', 'NOS'])
  assert.equal(options[0].label, 'Drum (not in UOM master)')
  assert.equal(resolveUomValue(options, 'kg'), 'KG')
  assert.equal(resolveUomValue(options, 'Drum'), 'Drum')
})
