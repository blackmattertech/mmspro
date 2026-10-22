const REFERENCE_TTL_MS = 10 * 60 * 1000

export const PICKER_LIMIT = 50

function createReferenceCache() {
  return {
    data: null,
    expiresAt: 0,
    inflight: null,
  }
}

const caches = new Map()

function getCacheKey(namespace, params = {}) {
  const sorted = Object.keys(params).sort().map((key) => `${key}:${params[key] ?? ''}`).join('|')
  return `${namespace}|${sorted}`
}

function getCache(namespace, params) {
  const key = getCacheKey(namespace, params)
  if (!caches.has(key)) caches.set(key, createReferenceCache())
  return caches.get(key)
}

export function peekReferenceData(namespace, params) {
  const cache = caches.get(getCacheKey(namespace, params))
  return cache?.data ?? null
}

export function peekCachedList(namespace, params) {
  const cached = peekReferenceData(namespace, params)
  if (!cached) return null
  const items = Array.isArray(cached) ? cached : (Array.isArray(cached.items) ? cached.items : [])
  return { items, total: cached.total ?? items.length }
}

export function seedReferenceData(namespace, params, data) {
  const cache = getCache(namespace, params)
  cache.data = data
  cache.expiresAt = Date.now() + REFERENCE_TTL_MS
}

export function invalidateReferenceCache(namespace) {
  if (!namespace) {
    caches.clear()
    return
  }
  for (const key of caches.keys()) {
    if (key.startsWith(`${namespace}|`)) caches.delete(key)
  }
}

export function fetchReferenceData(namespace, params, fetcher, { force = false } = {}) {
  const cache = getCache(namespace, params)
  const now = Date.now()

  if (!force && cache.data && cache.expiresAt > now) {
    return Promise.resolve(cache.data)
  }
  if (!force && cache.inflight) {
    return cache.inflight
  }

  const request = Promise.resolve(fetcher())
    .then((data) => {
      cache.data = data
      cache.expiresAt = Date.now() + REFERENCE_TTL_MS
      cache.inflight = null
      return data
    })
    .catch((err) => {
      if (cache.inflight === request) cache.inflight = null
      throw err
    })

  cache.inflight = request
  return request
}
