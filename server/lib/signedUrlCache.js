import { supabaseAdmin } from '../services/supabase.js'

/** In-memory signed URL cache: key = `${bucket}:${path}:${hourBucket}` */
const signedUrlCache = new Map()
const SIGNED_URL_TTL_SEC = 3600
/** Refresh a bit before expiry so clients never get a near-expired URL */
const CACHE_TTL_MS = (SIGNED_URL_TTL_SEC - 120) * 1000
const MAX_CACHE_ENTRIES = 2000

function cacheKey(bucket, path) {
  const hourBucket = Math.floor(Date.now() / CACHE_TTL_MS)
  return `${bucket}:${path}:${hourBucket}`
}

function pruneCache() {
  if (signedUrlCache.size <= MAX_CACHE_ENTRIES) return
  const entries = [...signedUrlCache.entries()]
  entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt)
  const toRemove = entries.slice(0, Math.ceil(entries.length / 4))
  for (const [key] of toRemove) signedUrlCache.delete(key)
}

/**
 * Create or reuse a signed storage URL. Returns null if signing fails.
 * @param {string} bucket
 * @param {string} path
 * @param {number} [expiresIn=3600]
 */
export async function getSignedUrl(bucket, path, expiresIn = SIGNED_URL_TTL_SEC) {
  if (!path) return null

  const key = cacheKey(bucket, path)
  const hit = signedUrlCache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.url
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) return null

  signedUrlCache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  pruneCache()
  return data.signedUrl
}

/**
 * Batch-sign unique paths in a bucket (deduped + cached).
 * @returns {Map<string, string|null>} path -> signed URL
 */
export async function getSignedUrls(bucket, paths, expiresIn = SIGNED_URL_TTL_SEC) {
  const unique = [...new Set((paths || []).filter(Boolean))]
  const result = new Map()
  await Promise.all(
    unique.map(async (path) => {
      result.set(path, await getSignedUrl(bucket, path, expiresIn))
    }),
  )
  return result
}
