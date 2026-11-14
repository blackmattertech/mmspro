import test from 'node:test'
import assert from 'node:assert/strict'
import { createTtlCache } from './ttlCache.js'

test('createTtlCache returns values within TTL and drops expired entries', async () => {
  const cache = createTtlCache({ ttlMs: 30, maxEntries: 10 })
  cache.set('dash', { ok: true })
  assert.deepEqual(cache.get('dash'), { ok: true })
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(cache.get('dash'), undefined)
})
