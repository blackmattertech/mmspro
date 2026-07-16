import { createHash } from 'node:crypto'
import { createTtlCache } from './ttlCache.js'

/** Auth / profile / permissions: short TTL so role changes apply quickly. */
const AUTH_TTL_MS = 60_000
const PROFILE_TTL_MS = 60_000
const PERMISSIONS_TTL_MS = 60_000

export const authUserCache = createTtlCache({ ttlMs: AUTH_TTL_MS, maxEntries: 2000 })
export const profileCache = createTtlCache({ ttlMs: PROFILE_TTL_MS, maxEntries: 2000 })
export const permissionsCache = createTtlCache({ ttlMs: PERMISSIONS_TTL_MS, maxEntries: 2000 })

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function permissionsCacheKey(profile) {
  if (!profile?.id) return null
  return `${profile.id}:${profile.org_id || ''}:${profile.role || ''}`
}

/** Drop cached permissions (call after role/permission mutations). */
export function invalidatePermissionsCache() {
  permissionsCache.clear()
}

export function invalidateProfile(userId) {
  if (userId) profileCache.delete(userId)
}

export function invalidateAuthToken(token) {
  if (token) authUserCache.delete(hashToken(token))
}
