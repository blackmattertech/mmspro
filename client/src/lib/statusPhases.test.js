import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WORK_ORDER_PHASES,
  WORK_REQUEST_PHASES,
  buildPhasesFromMaps,
  phasesForEntity,
  phaseCountsFromFine,
  resolveStatusFilters,
  togglePhaseSelection,
  toggleFineSelection,
  phaseSelectionKey,
  partitionWorkRequestStatusFilters,
} from './statusPhases.js'

test('phaseCountsFromFine sums statuses into phases', () => {
  const counts = [
    { status: 'started', count: 2 },
    { status: 'in_progress', count: 3 },
    { status: 'closed', count: 1 },
  ]
  const phases = phaseCountsFromFine(counts, WORK_ORDER_PHASES)
  assert.equal(phases.find((p) => p.id === 'in_progress').count, 5)
  assert.equal(phases.find((p) => p.id === 'closed').count, 1)
  assert.equal(phases.find((p) => p.id === 'open').count, 0)
})

test('resolveStatusFilters expands phase keys', () => {
  const selected = [phaseSelectionKey('waiting')]
  assert.deepEqual(
    resolveStatusFilters(selected, WORK_ORDER_PHASES).sort(),
    ['on_hold', 'returned_rework', 'waiting_material', 'waiting_shutdown'].sort(),
  )
})

test('togglePhaseSelection is exclusive single-select', () => {
  const once = togglePhaseSelection([], WORK_ORDER_PHASES[1])
  assert.deepEqual(once, [phaseSelectionKey('in_progress')])
  const switched = togglePhaseSelection(once, WORK_ORDER_PHASES[0])
  assert.deepEqual(switched, [phaseSelectionKey('open')])
  const cleared = togglePhaseSelection(switched, WORK_ORDER_PHASES[0])
  assert.deepEqual(cleared, [])
})

test('toggleFineSelection is exclusive single-select', () => {
  const withPhase = [phaseSelectionKey('in_progress')]
  const next = toggleFineSelection(withPhase, 'started', WORK_ORDER_PHASES)
  assert.deepEqual(next, ['started'])
  const cleared = toggleFineSelection(next, 'started', WORK_ORDER_PHASES)
  assert.deepEqual(cleared, [])
})

test('partitionWorkRequestStatusFilters splits request and execution keys', () => {
  const part = partitionWorkRequestStatusFilters([
    'pending_approval',
    'work_order_generated',
    'technician_assigned',
    'in_progress',
  ])
  assert.deepEqual(part.requestStatuses, ['pending_approval'])
  assert.deepEqual(part.executionStatuses, ['in_progress'])
  assert.equal(part.includeWorkOrderGenerated, true)
  assert.equal(part.includeTechnicianAssigned, true)
})

test('work request open phase includes synthetic WO keys', () => {
  const open = WORK_REQUEST_PHASES.find((p) => p.id === 'open')
  assert.ok(open.statuses.includes('work_order_generated'))
  assert.ok(open.statuses.includes('technician_assigned'))
})

test('buildPhasesFromMaps and phasesForEntity honor org maps over defaults', () => {
  const maps = [{ status_key: 'assigned', phase_id: 'open' }]
  const phases = buildPhasesFromMaps('work_order', maps)
  assert.deepEqual(phases.find((p) => p.id === 'open').statuses, ['assigned'])
  assert.deepEqual(phases.find((p) => p.id === 'done').statuses, [])

  const fromEntity = phasesForEntity('work_order', { work_order: maps })
  assert.deepEqual(fromEntity.find((p) => p.id === 'open').statuses, ['assigned'])
})

test('resolveStatusFilters with org maps only expands mapped keys', () => {
  const phases = buildPhasesFromMaps('work_request', [
    { status_key: 'submitted', phase_id: 'open' },
    { status_key: 'work_order_generated', phase_id: 'open' },
  ])
  assert.deepEqual(
    resolveStatusFilters([phaseSelectionKey('open')], phases).sort(),
    ['submitted', 'work_order_generated'].sort(),
  )
})
