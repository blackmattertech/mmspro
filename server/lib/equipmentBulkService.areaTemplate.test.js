import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extraPlacementColumns,
  hasCatalogAreaField,
} from './equipmentBulkService.js'

test('extraPlacementColumns never adds Area as a native column', () => {
  assert.deepEqual(extraPlacementColumns([]), ['Location', 'Department'])
  assert.deepEqual(
    extraPlacementColumns([{ name: 'Asset Name' }, { name: 'Serial' }]),
    ['Location', 'Department'],
  )
})

test('extraPlacementColumns omits Location/Department when parent fields already cover them', () => {
  assert.deepEqual(
    extraPlacementColumns([{ name: 'Location' }, { name: 'Department' }]),
    [],
  )
})

test('hasCatalogAreaField is true only for an active Area parent field', () => {
  assert.equal(hasCatalogAreaField([]), false)
  assert.equal(hasCatalogAreaField([{ name: 'Location' }]), false)
  assert.equal(hasCatalogAreaField([{ name: 'Area', is_active: false }]), false)
  assert.equal(hasCatalogAreaField([{ name: 'area' }]), true)
  assert.equal(hasCatalogAreaField([{ name: 'Area', is_active: true }]), true)
})
