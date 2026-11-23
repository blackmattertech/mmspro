import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPhasesFromMaps,
  DEFAULT_STATUS_PHASE_MAPS,
  defaultTaskMapsFromStatuses,
  mappingsToObject,
} from './statusPhaseMaps.js'

test('buildPhasesFromMaps expands WR defaults into Open/In progress/Waiting/Done/Closed', () => {
  const phases = buildPhasesFromMaps('work_request', DEFAULT_STATUS_PHASE_MAPS.work_request)
  assert.deepEqual(
    phases.find((p) => p.id === 'open').statuses.sort(),
    [
      'accepted',
      'info_provided',
      'need_info',
      'pending_approval',
      'submitted',
      'technician_assigned',
      'work_order_generated',
    ].sort(),
  )
  assert.deepEqual(
    phases.find((p) => p.id === 'done').statuses.sort(),
    ['completed', 'verified'].sort(),
  )
})

test('buildPhasesFromMaps excludes unmapped statuses from every pill', () => {
  const phases = buildPhasesFromMaps('work_order', [
    { status_key: 'assigned', phase_id: 'open' },
    { status_key: 'completed', phase_id: 'done' },
  ])
  assert.deepEqual(phases.find((p) => p.id === 'open').statuses, ['assigned'])
  assert.deepEqual(phases.find((p) => p.id === 'in_progress').statuses, [])
  assert.deepEqual(phases.find((p) => p.id === 'waiting').statuses, [])
  assert.deepEqual(phases.find((p) => p.id === 'done').statuses, ['completed'])
  assert.deepEqual(phases.find((p) => p.id === 'closed').statuses, [])
})

test('defaultTaskMapsFromStatuses splits open and marks terminal as done', () => {
  const maps = defaultTaskMapsFromStatuses([
    { id: 'a', name: 'Todo', sort_order: 0, is_terminal: false },
    { id: 'b', name: 'Doing', sort_order: 1, is_terminal: false },
    { id: 'c', name: 'Done', sort_order: 2, is_terminal: true },
  ])
  assert.equal(maps.a, 'open')
  assert.equal(maps.b, 'in_progress')
  assert.equal(maps.c, 'done')
})

test('mappingsToObject ignores empty keys', () => {
  assert.deepEqual(
    mappingsToObject([
      { status_key: 'assigned', phase_id: 'open' },
      { status_key: '', phase_id: 'done' },
      { status_key: 'closed', phase_id: '' },
    ]),
    { assigned: 'open' },
  )
})
