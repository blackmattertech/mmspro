import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertCloneChanged,
  buildCloneDraft,
  clonePayloadsEqual,
  normalizeClonePayload,
  stripIdentity,
  uniqueKeysUnchanged,
  CLONE_UNCHANGED_MESSAGE,
} from './recordClone.js'

test('normalizeClonePayload trims strings and sorts keys', () => {
  const normalized = normalizeClonePayload(
    { b: '  two ', a: 'one' },
    ['a', 'b'],
  )
  assert.deepEqual(normalized, { a: 'one', b: 'two' })
})

test('uniqueKeysUnchanged detects same code', () => {
  assert.equal(
    uniqueKeysUnchanged({ code: 'A1' }, { code: 'A1' }, ['code']),
    true,
  )
  assert.equal(
    uniqueKeysUnchanged({ code: 'A1' }, { code: 'A2' }, ['code']),
    false,
  )
})

test('assertCloneChanged fails when unique key unchanged', () => {
  const result = assertCloneChanged({
    source: { code: 'LOC-1', name: 'Plant' },
    next: { code: 'LOC-1', name: 'Plant West' },
    uniqueKeys: ['code'],
    compareKeys: ['code', 'name'],
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unique_key')
  assert.equal(result.message, CLONE_UNCHANGED_MESSAGE)
})

test('assertCloneChanged fails when payload fully unchanged even if keys listed', () => {
  const result = assertCloneChanged({
    source: { code: 'LOC-1', name: 'Plant' },
    next: { code: 'LOC-1', name: 'Plant' },
    uniqueKeys: ['code'],
    compareKeys: ['code', 'name'],
  })
  assert.equal(result.ok, false)
})

test('assertCloneChanged passes when unique key and another field change', () => {
  const result = assertCloneChanged({
    source: { code: 'LOC-1', name: 'Plant', city: 'Pune' },
    next: { code: 'LOC-2', name: 'Plant West', city: 'Pune' },
    uniqueKeys: ['code'],
    compareKeys: ['code', 'name', 'city'],
  })
  assert.equal(result.ok, true)
})

test('assertCloneChanged fails when only unique key changes but compareKeys exclude it and rest match', () => {
  // 2C requires unique key change AND overall payload difference.
  // If compareKeys include the unique key, changing only the key is enough for inequality.
  // If we also require "at least one other detail", compareKeys should include non-key fields
  // and we need an extra check — see assertCloneChanged: payloadsEqual uses compareKeys.
  // Changing only code with compareKeys [code,name] means payloads differ → ok:true.
  // Plan 2C: "must change unique key AND something else". Re-test with helper that
  // requires non-key delta when uniqueKeys provided.
  const source = { code: 'LOC-1', name: 'Plant' }
  const next = { code: 'LOC-2', name: 'Plant' }
  const result = assertCloneChanged({
    source,
    next,
    uniqueKeys: ['code'],
    compareKeys: ['code', 'name'],
  })
  // Current helper: ok because payloads differ. Plan wants also "something else".
  // Strengthened below in shared lib — this test documents expected strengthened behavior.
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unchanged')
})

test('clonePayloadsEqual ignores key order', () => {
  assert.equal(
    clonePayloadsEqual({ a: 1, b: 2 }, { b: 2, a: 1 }, ['a', 'b']),
    true,
  )
})

test('stripIdentity and buildCloneDraft drop ids', () => {
  const draft = buildCloneDraft(
    { id: 'x', org_id: 'o', code: 'A', name: 'N', plan_number: 'PM-1' },
    { omit: ['plan_number'], defaults: { status: 'inactive' } },
  )
  assert.equal(draft.id, undefined)
  assert.equal(draft.plan_number, undefined)
  assert.equal(draft.code, 'A')
  assert.equal(draft.status, 'inactive')
  assert.deepEqual(stripIdentity({ id: '1', foo: 'bar' }), { foo: 'bar' })
})
