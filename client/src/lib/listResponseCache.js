const FRESH_MS = 25_000
const MAX_ENTRIES = 60

/** @type {Map<string, { data: any, fetchedAt: number }>} */
const cache = new Map()

function prune() {
  if (cache.size <= MAX_ENTRIES) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
  const excess = cache.size - MAX_ENTRIES
  for (let i = 0; i < excess; i += 1) {
    cache.delete(oldest[i][0])
  }
}

export function listResponseCacheKey(namespace, params) {
  return `${namespace}:${JSON.stringify(params)}`
}

export function getCachedListResponse(key) {
  if (!key) return null
  return cache.get(key) || null
}

export function isListResponseFresh(entry) {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < FRESH_MS
}

export function setCachedListResponse(key, data) {
  if (!key) return
  cache.set(key, { data, fetchedAt: Date.now() })
  prune()
}

export function invalidateListResponseCache(namespacePrefix = null) {
  if (!namespacePrefix) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${namespacePrefix}:`) || key.startsWith(namespacePrefix)) {
      cache.delete(key)
    }
  }
}
