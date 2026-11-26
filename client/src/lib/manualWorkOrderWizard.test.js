import test from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutForSection,
  layoutForSections,
  manualWorkOrderPages,
  manualWorkOrderSteps,
  prepareManualLayout,
} from './manualWorkOrderWizard.js'

const layout = {
  sections: [
    { id: 'wo_info', label: 'Workorder Information', order: 1 },
    { id: 'wo_asset', label: 'Asset information', order: 2 },
    { id: 'wo_maintenance', label: 'Maintenance Information', order: 3 },
    { id: 'wo_activity', label: 'Activity Information', order: 4 },
    { id: 'wo_docs', label: 'Detailed Work Description', order: 5 },
    { id: 'wo_attended', label: 'Attended by', order: 6 },
    { id: 'wo_empty', label: 'Empty', order: 7 },
  ],
  fields: [
    { id: 'f1', sectionId: 'wo_info', label: 'Order to' },
    { id: 'f2', sectionId: 'wo_asset', label: 'Asset', bindKey: 'asset_picker' },
    { id: 'f3', sectionId: 'wo_maintenance', label: 'Short description' },
    { id: 'f4', sectionId: 'wo_activity', label: 'Vendor' },
    { id: 'f5', sectionId: 'wo_docs', label: 'Job description' },
    { id: 'f6', sectionId: 'wo_attended', label: 'Assignment', bindKey: 'assignment' },
  ],
  groups: [],
}

test('manualWorkOrderPages pairs two sections per page by default', () => {
  const pages = manualWorkOrderPages(layout)
  assert.equal(pages.length, 3)
  assert.deepEqual(pages[0].sectionIds, ['wo_info', 'wo_asset'])
  assert.equal(pages[0].label, 'Workorder Information · Asset information')
  assert.deepEqual(pages[1].sectionIds, ['wo_maintenance', 'wo_activity'])
  assert.deepEqual(pages[2].sectionIds, ['wo_docs', 'wo_attended'])
})

test('manualWorkOrderPages skips empty sections', () => {
  const pages = manualWorkOrderPages(layout)
  assert.equal(pages.flatMap((page) => page.sectionIds).includes('wo_empty'), false)
})

test('manualWorkOrderPages supports a custom page size', () => {
  const pages = manualWorkOrderPages(layout, { sectionsPerPage: 3 })
  assert.equal(pages.length, 2)
  assert.deepEqual(pages[0].sectionIds, ['wo_info', 'wo_asset', 'wo_maintenance'])
  assert.deepEqual(pages[1].sectionIds, ['wo_activity', 'wo_docs', 'wo_attended'])
})

test('layoutForSections filters to the requested section ids', () => {
  const filtered = layoutForSections(layout, ['wo_info', 'wo_asset'])
  assert.deepEqual(filtered.sections.map((row) => row.id), ['wo_info', 'wo_asset'])
  assert.deepEqual(filtered.fields.map((row) => row.id), ['f1', 'f2'])
})

test('layoutForSection remains a single-section helper', () => {
  const filtered = layoutForSection(layout, 'wo_maintenance')
  assert.equal(filtered.sections.length, 1)
  assert.equal(filtered.fields.length, 1)
})

test('manualWorkOrderSteps still returns one step per section', () => {
  assert.equal(manualWorkOrderSteps(layout).length, 6)
})

test('prepareManualLayout binds unlabeled Order To / Order From fields', () => {
  const prepared = prepareManualLayout({
    sections: [],
    fields: [
      { id: 'field:1', sectionId: 'wo_info', label: 'Order to', masterSource: 'departments' },
      { id: 'field:2', sectionId: 'wo_info', label: 'Order From', masterSource: 'departments' },
      { id: 'system:order_to_department_id', sectionId: 'wo_info', label: 'Order to' },
      { id: 'field:3', sectionId: 'wo_info', label: 'Priority', bindKey: 'priority' },
    ],
    groups: [],
  })
  assert.equal(prepared.fields[0].bindKey, 'order_to_department_id')
  assert.equal(prepared.fields[1].bindKey, 'order_from_department_id')
  assert.equal(prepared.fields[2].bindKey, undefined)
  assert.equal(prepared.fields[3].bindKey, 'priority')
})
