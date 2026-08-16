import { createTtlCache } from './ttlCache.js'

const DEFAULTS_TTL_MS = 10 * 60_000
const META_TTL_MS = 60_000

const defaultsCache = createTtlCache({ ttlMs: DEFAULTS_TTL_MS, maxEntries: 500 })
const metaCache = createTtlCache({ ttlMs: META_TTL_MS, maxEntries: 500 })

export function invalidateTaskOrgCache(orgId) {
  if (!orgId) return
  defaultsCache.delete(`defaults:${orgId}`)
  metaCache.delete(`meta:${orgId}`)
}

export async function ensureOrgTaskDefaultsCached(orgId, ensureFn) {
  const key = `defaults:${orgId}`
  if (defaultsCache.get(key)) return
  await ensureFn()
  defaultsCache.set(key, true)
}

export function getCachedActiveTaskMeta(orgId) {
  return metaCache.get(`meta:${orgId}`)
}

export function setCachedActiveTaskMeta(orgId, meta) {
  metaCache.set(`meta:${orgId}`, meta)
}
