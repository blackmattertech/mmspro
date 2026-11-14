import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyUomMaster,
  isUomCodeKey,
  normalizeUomCode,
  normalizeUomName,
} from './uomMaster.js'

test('normalizeUomCode stores a canonical uppercase code', () => {
  assert.equal(normalizeUomCode(' kg '), 'KG')
  assert.equal(normalizeUomCode('sq.m'), 'SQ.M')
  assert.equal(normalizeUomCode('m/s'), 'M/S')
})

test('normalizeUomCode rejects blank and punctuation codes', () => {
  assert.throws(() => normalizeUomCode('   '), { status: 400 })
  assert.throws(() => normalizeUomCode('KG!'), { status: 400 })
  assert.equal(isUomCodeKey('NOS'), true)
  assert.equal(isUomCodeKey(''), false)
})

test('normalizeUomName requires a readable name', () => {
  assert.equal(normalizeUomName('  Kilo gram '), 'Kilo gram')
  assert.throws(() => normalizeUomName('   '), { status: 400 })
})

test('applyUomMaster maps known units and keeps previously saved free text', () => {
  const rows = applyUomMaster(
    [
      { code: 'A', uom: 'kg' },
      { code: 'B', uom: 'Each' },
      { code: 'C', uom: '' },
    ],
    ['KG', 'NOS'],
    [{ uom: 'Each' }],
  )
  assert.deepEqual(rows.map((row) => row.uom), ['KG', 'Each', ''])
})

test('applyUomMaster rejects a new unit that is not in the master', () => {
  assert.throws(
    () => applyUomMaster([{ uom: 'Dozen' }], ['NOS'], []),
    (err) => err.status === 400 && /Dozen/.test(err.message) && /Masters → UOM/.test(err.message),
  )
})
