/**
 * Tiny in-memory TTL cache for hot request paths (auth, profile, permissions).
 */
export function createTtlCache({ ttlMs = 60_000, maxEntries = 2000 } = {}) {
  const map = new Map()

  function prune() {
    if (map.size <= maxEntries) return
    const now = Date.now()
    for (const [key, entry] of map) {
      if (entry.expiresAt <= now) map.delete(key)
    }
    if (map.size <= maxEntries) return
    const excess = map.size - maxEntries
    const keys = map.keys()
    for (let i = 0; i < excess; i += 1) {
      const next = keys.next()
      if (next.done) break
      map.delete(next.value)
    }
  }

  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (hit.expiresAt <= Date.now()) {
        map.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key, value, customTtlMs = ttlMs) {
      map.set(key, { value, expiresAt: Date.now() + customTtlMs })
      prune()
    },
    delete(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
    get size() {
      return map.size
    },
  }
}
