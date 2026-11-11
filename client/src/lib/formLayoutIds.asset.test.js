import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeAssetLayout,
  isPrimaryAssetPickerField,
  systemId,
  masterId,
  catalogId,
  ASSET_PICKER_KEYS,
} from './formLayoutIds.js'

test('ASSET_PICKER_KEYS covers compound aliases', () => {
  assert.ok(ASSET_PICKER_KEYS.has('asset_picker'))
  assert.ok(ASSET_PICKER_KEYS.has('equipment_id'))
  assert.ok(ASSET_PICKER_KEYS.has('area_id'))
})

test('normalizeAssetLayout collapses legacy asset controls into one picker', () => {
  const layout = {
    v: 1,
    sections: [
      { id: 's1', order: 0, label: 'Request' },
      { id: 's2', order: 1, label: 'Location details' },
    ],
    fields: [
      { id: systemId('request_type'), sectionId: 's1', order: 0 },
      { id: masterId('areas'), sectionId: 's2', order: 0, masterSource: 'areas', required: true },
      { id: masterId('equipment'), sectionId: 's2', order: 1, masterSource: 'equipment', required: true },
      { id: systemId('area_id'), sectionId: 's2', order: 2, bindKey: 'area_id' },
    ],
    groups: [],
  }

  const next = normalizeAssetLayout(layout)
  const assetFields = (next.fields || []).filter(isPrimaryAssetPickerField)
  assert.equal(assetFields.length, 1)
  assert.equal(assetFields[0].id, systemId('asset_picker'))
  // Preserves first legacy control's section (admin placement), not /asset/i relocate.
  assert.equal(assetFields[0].sectionId, 's2')
  assert.equal(assetFields[0].required, true)
})

test('normalizeAssetLayout is idempotent', () => {
  const layout = {
    v: 1,
    sections: [{ id: 'asset', order: 0, label: 'Asset Information' }],
    fields: [
      { id: systemId('asset_picker'), sectionId: 'asset', order: 0, bindKey: 'asset_picker', required: true },
      { id: masterId('equipment'), sectionId: 'asset', order: 1, masterSource: 'equipment' },
    ],
    groups: [],
  }
  const once = normalizeAssetLayout(layout)
  const twice = normalizeAssetLayout(once)
  assert.deepEqual(once, twice)
  assert.equal((once.fields || []).filter(isPrimaryAssetPickerField).length, 1)
})

test('normalizeAssetLayout strips equipment catalog mirrors when catalogFields provided', () => {
  const eqFieldId = 'eq-parent-1'
  const layout = {
    v: 1,
    sections: [{ id: 'asset', order: 0, label: 'Asset' }],
    fields: [
      { id: systemId('asset_picker'), sectionId: 'asset', order: 0, bindKey: 'asset_picker' },
      { id: catalogId(eqFieldId), sectionId: 'asset', order: 1 },
      { id: catalogId('other-1'), sectionId: 'asset', order: 2 },
    ],
    groups: [],
  }
  const catalogFields = [
    { id: eqFieldId, field_source: 'equipment', name: 'Equipment Type' },
    { id: 'other-1', field_source: 'custom', name: 'Note' },
  ]
  const next = normalizeAssetLayout(layout, { catalogFields })
  const ids = (next.fields || []).map((field) => field.id)
  assert.ok(ids.includes(systemId('asset_picker')))
  assert.ok(ids.includes(catalogId('other-1')))
  assert.ok(!ids.includes(catalogId(eqFieldId)))
})
