import test from 'node:test'
import assert from 'node:assert/strict'
import {
  listResponseCacheKey,
  getCachedListResponse,
  setCachedListResponse,
  isListResponseFresh,
  invalidateListResponseCache,
} from './listResponseCache.js'

test('listResponseCache stores and reads fresh entries', () => {
  invalidateListResponseCache()
  const key = listResponseCacheKey('wo-received', { limit: 10, offset: 0 })
  assert.equal(getCachedListResponse(key), null)

  const payload = [{ id: '1' }]
  payload.total = 1
  setCachedListResponse(key, payload)

  const entry = getCachedListResponse(key)
  assert.ok(entry)
  assert.equal(entry.data, payload)
  assert.equal(isListResponseFresh(entry), true)
})

test('invalidateListResponseCache clears by namespace prefix', () => {
  invalidateListResponseCache()
  setCachedListResponse(listResponseCacheKey('wo-manual', { a: 1 }), [])
  setCachedListResponse(listResponseCacheKey('wr-my', { a: 1 }), [])
  invalidateListResponseCache('wo-manual')
  assert.equal(getCachedListResponse(listResponseCacheKey('wo-manual', { a: 1 })), null)
  assert.ok(getCachedListResponse(listResponseCacheKey('wr-my', { a: 1 })))
  invalidateListResponseCache()
})
