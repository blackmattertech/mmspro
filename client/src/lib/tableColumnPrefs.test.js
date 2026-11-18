import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyColumnToggle,
  columnsSetAll,
  resolveColumnPrefs,
  visibleIdsFromPrefs,
} from './tableColumnPrefs.js'

const COLUMNS = [
  { id: 'wr_number', label: 'WR #' },
  { id: 'type', label: 'Type' },
  { id: 'job_nature', label: 'Job nature', defaultVisible: false },
  { id: 'actions', label: 'Actions', locked: true },
]

test('select all shows every toggleable column and keeps locked columns', () => {
  const prefs = resolveColumnPrefs(null, COLUMNS)
  const next = applyColumnToggle(prefs, COLUMNS, columnsSetAll(true))
  assert.deepEqual(
    visibleIdsFromPrefs(next, COLUMNS),
    ['wr_number', 'type', 'job_nature', 'actions'],
  )
})

test('deselect all hides every toggleable column and keeps locked columns visible', () => {
  const prefs = resolveColumnPrefs(null, COLUMNS)
  const shown = applyColumnToggle(prefs, COLUMNS, columnsSetAll(true))
  const hidden = applyColumnToggle(shown, COLUMNS, columnsSetAll(false))
  assert.deepEqual(visibleIdsFromPrefs(hidden, COLUMNS), ['actions'])
  assert.deepEqual(hidden.order, shown.order)
})

test('deselect all can hide every column when none are locked', () => {
  const defs = COLUMNS.filter((col) => col.id !== 'actions')
  const prefs = resolveColumnPrefs(null, defs)
  const hidden = applyColumnToggle(prefs, defs, columnsSetAll(false))
  assert.deepEqual(visibleIdsFromPrefs(hidden, defs), [])
  const shown = applyColumnToggle(hidden, defs, columnsSetAll(true))
  assert.deepEqual(visibleIdsFromPrefs(shown, defs), hidden.order)
})

test('a single toggle still refuses to hide the last visible column', () => {
  const defs = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]
  const prefs = resolveColumnPrefs(null, defs)
  const onlyA = applyColumnToggle(prefs, defs, 'b')
  const stillA = applyColumnToggle(onlyA, defs, 'a')
  assert.deepEqual(visibleIdsFromPrefs(onlyA, defs), ['a'])
  assert.deepEqual(visibleIdsFromPrefs(stillA, defs), ['a'])
})

test('select all leaves prefs unchanged when every toggleable column is already visible', () => {
  const defs = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]
  const prefs = resolveColumnPrefs(null, defs)
  const next = applyColumnToggle(prefs, defs, columnsSetAll(true))
  assert.deepEqual(next.order, prefs.order)
  assert.deepEqual(next.hidden, prefs.hidden)
})
