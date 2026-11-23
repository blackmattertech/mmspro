import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPhasesFromMaps,
  DEFAULT_STATUS_PHASE_MAPS,
  assertStatusFilterEntityType,
  phaseIdsForEntity,
} from '../shared/statusPhaseMaps.js'

test('assertStatusFilterEntityType accepts known modules', () => {
  assert.equal(assertStatusFilterEntityType('work_order'), 'work_order')
})

test('assertStatusFilterEntityType rejects unknown modules', () => {
  assert.throws(() => assertStatusFilterEntityType('nope'), /Invalid status filter module/)
})

test('phaseIdsForEntity lists WO pills', () => {
  assert.deepEqual(
    [...phaseIdsForEntity('work_order')].sort(),
    ['closed', 'done', 'in_progress', 'open', 'waiting'].sort(),
  )
})

test('WO default maps match legacy Open/Waiting membership', () => {
  const phases = buildPhasesFromMaps('work_order', DEFAULT_STATUS_PHASE_MAPS.work_order)
  assert.deepEqual(phases.find((p) => p.id === 'open').statuses.sort(), ['accepted', 'assigned'].sort())
  assert.deepEqual(
    phases.find((p) => p.id === 'waiting').statuses.sort(),
    ['on_hold', 'returned_rework', 'waiting_material', 'waiting_shutdown'].sort(),
  )
})
