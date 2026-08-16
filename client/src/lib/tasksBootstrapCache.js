const FRESH_MS = 30_000
const MAX_ENTRIES = 40

/** @type {Map<string, { data: object, fetchedAt: number }>} */
const cache = new Map()

function prune() {
  if (cache.size <= MAX_ENTRIES) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
  const excess = cache.size - MAX_ENTRIES
  for (let i = 0; i < excess; i += 1) {
    cache.delete(oldest[i][0])
  }
}

export function bootstrapCacheKey(filters, view) {
  return `${view}:${JSON.stringify(filters)}`
}

export function getCachedBootstrap(key) {
  return cache.get(key) || null
}

export function isBootstrapFresh(entry) {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < FRESH_MS
}

export function setCachedBootstrap(key, data) {
  cache.set(key, { data, fetchedAt: Date.now() })
  prune()
}

export function invalidateTasksBootstrapCache() {
  cache.clear()
}
