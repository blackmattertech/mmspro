import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUomActive, parseUomBulkRow } from './uomBulkService.js'

test('parseUomBulkRow accepts the template columns', () => {
  assert.deepEqual(
    parseUomBulkRow({
      Code: ' nos ',
      Name: ' Numbers ',
      Category: ' Count Units ',
      Active: 'Yes',
    }),
    {
      code: 'NOS',
      name: 'Numbers',
      category: 'Count Units',
      is_active: true,
    },
  )
  assert.deepEqual(parseUomBulkRow({ Code: 'KG', Name: 'Kilogram', Active: 'Yes' }), {
    code: 'KG',
    name: 'Kilogram',
    category: null,
    is_active: true,
  })
  assert.equal(parseUomActive(''), true)
  assert.equal(parseUomActive('Inactive'), false)
})

test('parseUomBulkRow rejects a bad active value', () => {
  assert.throws(() => parseUomBulkRow({ Code: 'KG', Name: 'Kilogram', Active: 'maybe' }), { status: 400 })
})
