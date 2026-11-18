import test from 'node:test'
import assert from 'node:assert/strict'
import { enforceNestedCloneOrThrow, enforceOptionClonesOrThrow } from './nestedClone.js'

const source = { id: 'src', name: 'Lubrication', description: 'Grease' }
const loadSource = async (id) => (id === 'src' ? source : null)

async function rejects(promise, { status, code, message } = {}) {
  await assert.rejects(promise, (err) => {
    if (status) assert.equal(err.status, status)
    if (code) assert.equal(err.code, code)
    if (message) assert.match(err.message, message)
    return true
  })
}

test('no clone_of_id → normal create is untouched', async () => {
  const result = await enforceNestedCloneOrThrow({
    body: { name: 'Lubrication', description: 'Grease' },
    kind: 'pm_activity_type',
    loadSource: async () => { throw new Error('must not load') },
  })
  assert.equal(result, null)
})

test('unknown source → 404', async () => {
  await rejects(
    enforceNestedCloneOrThrow({
      body: { clone_of_id: 'missing', name: 'x' },
      kind: 'pm_activity_type',
      loadSource,
    }),
    { status: 404 },
  )
})

test('unchanged duplicate → 400 CLONE_UNCHANGED, changed duplicate passes', async () => {
  await rejects(
    enforceNestedCloneOrThrow({
      body: { clone_of_id: 'src', name: 'lubrication', description: 'Other' },
      kind: 'pm_activity_type',
      loadSource,
    }),
    { status: 400, code: 'CLONE_UNCHANGED' },
  )
  const row = await enforceNestedCloneOrThrow({
    body: { clone_of_id: 'src', name: 'Lubrication 2', description: 'Oil' },
    kind: 'pm_activity_type',
    loadSource,
  })
  assert.equal(row, source)
})

test('option clones: source must exist, label must change, labels unique within field', async () => {
  const currentOptions = ['Electrical', { label: 'Mechanical', value: 'Mechanical' }]

  // Normal save (no clones) is a no-op even with repeated labels.
  await enforceOptionClonesOrThrow({ currentOptions, nextOptions: ['A', 'a'], clones: undefined })

  await rejects(
    enforceOptionClonesOrThrow({
      currentOptions,
      nextOptions: ['Electrical', 'Electrical'],
      clones: [{ clone_of_id: 'Electrical', label: 'Electrical' }],
    }),
    { status: 400, code: 'CLONE_UNCHANGED' },
  )
  await rejects(
    enforceOptionClonesOrThrow({
      currentOptions,
      nextOptions: ['Electrical', 'Plumbing'],
      clones: [{ clone_of_id: 'Gone', label: 'Plumbing' }],
    }),
    { status: 404 },
  )
  await rejects(
    enforceOptionClonesOrThrow({
      currentOptions,
      nextOptions: ['Electrical', 'Mechanical', 'electrical 2', 'ELECTRICAL 2'],
      clones: [{ clone_of_id: 'Electrical', label: 'Electrical 2' }],
    }),
    { status: 400, message: /already exists/ },
  )
  await enforceOptionClonesOrThrow({
    currentOptions,
    nextOptions: ['Electrical', 'Electrical 2', 'Mechanical'],
    clones: [{ clone_of_id: 'Electrical', label: 'Electrical 2' }],
  })
})
