import test from 'node:test'
import assert from 'node:assert/strict'
import { endPasswordVerificationSession } from './deleteOrganization.js'

test('endPasswordVerificationSession signs out with local scope only', async () => {
  const calls = []
  const authClient = {
    auth: {
      signOut: async (options) => {
        calls.push(options)
      },
    },
  }

  await endPasswordVerificationSession(authClient)

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { scope: 'local' })
})
