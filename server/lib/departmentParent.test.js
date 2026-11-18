import test from 'node:test'
import assert from 'node:assert/strict'
import { mapDepartmentsWithParents } from './departmentParent.js'

test('mapDepartmentsWithParents attaches parent object by parent_id', () => {
  const rows = [
    { id: 'child', name: 'Electrical', parent_id: 'parent' },
    { id: 'parent', name: 'General Maintenance', parent_id: null },
  ]
  const parents = [{ id: 'parent', name: 'General Maintenance', code: 'GEN' }]
  const result = mapDepartmentsWithParents(rows, parents)
  assert.equal(result[0].parent?.name, 'General Maintenance')
  assert.equal(result[0].parent?.code, 'GEN')
  assert.equal(result[1].parent, null)
})

test('mapDepartmentsWithParents returns null parent when parent row is missing', () => {
  const result = mapDepartmentsWithParents(
    [{ id: 'child', name: 'Electrical', parent_id: 'missing' }],
    [],
  )
  assert.equal(result[0].parent, null)
})

test('mapDepartmentsWithParents supports a single department object', () => {
  const result = mapDepartmentsWithParents(
    { id: 'child', name: 'Electrical', parent_id: 'parent' },
    [{ id: 'parent', name: 'General Maintenance', code: 'GEN' }],
  )
  assert.equal(result.parent?.name, 'General Maintenance')
})
