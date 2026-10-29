import test from 'node:test'
import assert from 'node:assert/strict'
import { getFormDef, buildDefaultLayout } from './formRegistry.js'
import { systemId } from './formLayoutIds.js'
import {
  applyCompanySkipsToLayout,
  describeSkipBoard,
  emptySkipSets,
  normalizeSkipPayload,
  sectionCanSkip,
  skipSetsFromRows,
} from './formSkips.js'

const FORM_ID = 'work_orders.from_work_request'

function wrToWo() {
  const formDef = getFormDef(FORM_ID)
  assert.ok(formDef, 'Work Request to Work Order form is registered')
  return { formDef, layout: buildDefaultLayout(formDef, []) }
}

function fieldOnBoard(board, key) {
  const id = systemId(key)
  for (const section of board.sections) {
    const field = (section.fields || []).find((item) => item.id === id)
    if (field) return { section, field }
  }
  return { section: null, field: null }
}

function sectionByKey(boardOrLayout, key) {
  const id = systemId(key)
  return (boardOrLayout.sections || []).find((section) => section.id === id) || null
}

test('skipSetsFromRows maps field and section kinds onto plural sets', () => {
  const skips = skipSetsFromRows([
    { kind: 'field', target_id: systemId('assignment_remarks') },
    { kind: 'section', target_id: systemId('wo_execution') },
    { kind: 'process', target_id: 'technician_acceptance' },
  ])
  assert.equal(skips.fields.has(systemId('assignment_remarks')), true)
  assert.equal(skips.sections.has(systemId('wo_execution')), true)
  assert.equal(skips.process.has('technician_acceptance'), true)
})

test('WR→WO optional fields are skippable', () => {
  const { formDef, layout } = wrToWo()
  const board = describeSkipBoard(FORM_ID, layout, emptySkipSets(), { formDef })
  for (const key of [
    'assignment_remarks',
    'labour_count',
    'vendor_expense',
    'breakdown_times',
    'daily_logs',
    'permit_details',
  ]) {
    const { field } = fieldOnBoard(board, key)
    assert.ok(field, `${key} should be on the skip board`)
    assert.equal(field.required, false, `${key} is not Superadmin required`)
    assert.equal(field.locked, false, `${key} is not locked`)
    assert.equal(field.skippable, true, `${key} can be skipped`)
  }
})

test('WR→WO required and locked fields cannot be skipped', () => {
  const { formDef, layout } = wrToWo()
  const board = describeSkipBoard(FORM_ID, layout, emptySkipSets(), { formDef })

  const stamps = fieldOnBoard(board, 'work_stamps').field
  assert.ok(stamps)
  assert.equal(stamps.skippable, false)
  assert.equal(stamps.locked || stamps.required, true)

  for (const key of ['job_description', 'root_cause', 'action_taken', 'material_consumed']) {
    const { field } = fieldOnBoard(board, key)
    assert.ok(field, key)
    assert.equal(field.skippable, false, key)
    assert.equal(field.required, true, key)
  }
})

test('mixed Work execution section can skip optionals; closeout cannot skip', () => {
  const { formDef, layout } = wrToWo()
  const board = describeSkipBoard(FORM_ID, layout, emptySkipSets(), { formDef })

  const execution = sectionByKey(board, 'wo_execution')
  assert.ok(execution)
  assert.equal(execution.skippable, true)
  assert.equal(sectionCanSkip(layout, sectionByKey(layout, 'wo_execution'), formDef), true)

  const docs = sectionByKey(board, 'wo_docs')
  assert.ok(docs)
  assert.equal(docs.skippable, true)

  const closeout = sectionByKey(layout, 'wo_closeout')
  assert.ok(closeout)
  assert.equal(sectionCanSkip(layout, closeout, formDef), false)
  assert.equal(sectionByKey(board, 'wo_closeout').skippable, false)
})

test('normalizeSkipPayload accepts optional fields, mixed section skip, and technician acceptance', () => {
  const { formDef, layout } = wrToWo()
  const rows = normalizeSkipPayload(FORM_ID, layout, {
    skippedFieldIds: [systemId('assignment_remarks'), systemId('labour_count')],
    skippedSectionIds: [systemId('wo_execution')],
    skipTechnicianAcceptance: true,
  }, formDef)

  assert.ok(rows.some((row) => row.kind === 'field' && row.target_id === systemId('assignment_remarks')))
  assert.ok(rows.some((row) => row.kind === 'field' && row.target_id === systemId('labour_count')))
  assert.ok(rows.some((row) => row.kind === 'section' && row.target_id === systemId('wo_execution')))
  assert.ok(rows.some((row) => row.kind === 'process' && row.target_id === 'technician_acceptance'))
})

test('describeSkipBoard reflects saved field skips after load', () => {
  const { formDef, layout } = wrToWo()
  const skips = skipSetsFromRows([{ kind: 'field', target_id: systemId('assignment_remarks') }])
  const board = describeSkipBoard(FORM_ID, layout, skips, { formDef })
  const { field } = fieldOnBoard(board, 'assignment_remarks')
  assert.equal(field.skipped, true)
  assert.equal(field.skippedExplicit, true)
  assert.equal(field.skippable, true)
})

test('runtime skip overlay hides optional fields and keeps required ones', () => {
  const { formDef, layout } = wrToWo()
  const skips = skipSetsFromRows([
    { kind: 'field', target_id: systemId('assignment_remarks') },
    { kind: 'section', target_id: systemId('wo_execution') },
    { kind: 'field', target_id: systemId('daily_logs') },
  ])
  const applied = applyCompanySkipsToLayout(layout, skips, formDef)
  const byId = Object.fromEntries((applied.fields || []).map((field) => [field.id, field]))

  assert.equal(byId[systemId('assignment_remarks')].skipped, true)
  assert.equal(byId[systemId('labour_count')].skipped, true)
  assert.equal(byId[systemId('vendor_expense')].skipped, true)
  assert.equal(byId[systemId('daily_logs')].skipped, true)
  assert.equal(Boolean(byId[systemId('work_stamps')].skipped), false)
  assert.equal(byId[systemId('work_stamps')].required, true)
  assert.equal(Boolean(byId[systemId('job_description')].skipped), false)
  assert.equal(byId[systemId('job_description')].required, true)
})

test('normalizeSkipPayload rejects required fields and closeout section skip', () => {
  const { formDef, layout } = wrToWo()

  assert.throws(
    () => normalizeSkipPayload(FORM_ID, layout, { skippedFieldIds: [systemId('work_stamps')] }, formDef),
    /Cannot skip required field/,
  )
  assert.throws(
    () => normalizeSkipPayload(FORM_ID, layout, { skippedFieldIds: [systemId('job_description')] }, formDef),
    /Cannot skip required field/,
  )
  assert.throws(
    () => normalizeSkipPayload(FORM_ID, layout, { skippedSectionIds: [systemId('wo_closeout')] }, formDef),
    /Supervisor verification cannot be skipped/,
  )
})
