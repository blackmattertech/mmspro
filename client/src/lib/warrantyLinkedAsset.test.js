import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayWarrantyLinkedSteps,
  warrantyLinkedAssetSteps,
} from './warrantyLinkedAsset.js'

test('warrantyLinkedAssetSteps keeps Name and QR-mapped field only', () => {
  const steps = warrantyLinkedAssetSteps(
    { name: 'Admin AC DB', code: 'ELEDB-03', field_values: [] },
    { qrFieldId: 'system:code', fields: [{ id: 'system:code' }, { id: 'system:name' }] },
  )
  assert.deepEqual(steps, [
    { field_id: 'name', field_name: 'Name', value: 'Admin AC DB' },
    { field_id: 'qr', field_name: 'Code', value: 'ELEDB-03' },
  ])
})

test('displayWarrantyLinkedSteps repairs legacy UUID-labeled rows', () => {
  const steps = displayWarrantyLinkedSteps([
    { field_id: 'a2dcd66b-42dc-4085-ad78-cebcf920a422', field_name: 'a2dcd66b-42dc-4085-ad78-cebcf920a422', value: 'Admin' },
    { field_id: 'b2dcd66b-42dc-4085-ad78-cebcf920a422', field_name: 'b2dcd66b-42dc-4085-ad78-cebcf920a422', value: 'Admin AC DB' },
    { field_id: 'c2dcd66b-42dc-4085-ad78-cebcf920a422', field_name: 'c2dcd66b-42dc-4085-ad78-cebcf920a422', value: 'ELEDB-03' },
  ])
  assert.deepEqual(steps, [
    { field_id: 'name', field_name: 'Name', value: 'Admin' },
    { field_id: 'qr', field_name: 'Code', value: 'ELEDB-03' },
  ])
})

test('displayWarrantyLinkedSteps prefers stored Name/QR rows', () => {
  const steps = displayWarrantyLinkedSteps([
    { field_id: 'name', field_name: 'Name', value: 'Pump A' },
    { field_id: 'qr', field_name: 'Equipment ID', value: 'P-01' },
    { field_id: 'extra', field_name: 'Location', value: 'Plant 1' },
  ])
  assert.deepEqual(steps, [
    { field_id: 'name', field_name: 'Name', value: 'Pump A' },
    { field_id: 'qr', field_name: 'Equipment ID', value: 'P-01' },
  ])
})
