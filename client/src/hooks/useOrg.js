import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement, useRef } from 'react'
import { useAuth } from './useAuth'
import { getOrgCache, setOrgCache, clearOrgCache } from '../lib/orgCache'
import { fetchSession, peekSession, sessionIsUsable } from '../lib/session'
import { loadOrgBootstrap } from '../lib/orgBootstrap'

const OrgContext = createContext(null)

function meFromPayload(payload) {
  if (!payload) return null
  return {
    profile: payload.profile || null,
    employee: payload.employee || null,
    avatarUrl: payload.avatar_url || null,
  }
}

/**
 * Shared org + permissions bootstrap. One GET /api/session per user session
 * instead of N× useOrg fetches + separate permissions call.
 */
export function OrgProvider({ children }) {
  const { user, setAccountRole, bootstrapEpoch } = useAuth()
  const userId = user?.id ?? null
  const peeked = peekSession(userId)
  const [org, setOrg] = useState(null)
  const [orgRole, setOrgRole] = useState(null)
  const [permissionSession, setPermissionSession] = useState(null)
  const [me, setMe] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [bootstrappedUserId, setBootstrappedUserId] = useState(null)
  const [error, setError] = useState(null)
  const bootstrappedUserIdRef = useRef(null)

  const applyBootstrap = useCallback((uid, payload) => {
    const nextOrg = payload?.org || null
    const nextRole = payload?.role || null
    const nextPerms = payload?.permissions || null
    setOrg(nextOrg)
    setOrgRole(nextRole)
    setPermissionSession(nextPerms)
    setMe(meFromPayload(payload))
    setAccountRole?.(nextRole)
    setBootstrappedUserId(uid || null)
    bootstrappedUserIdRef.current = uid || null
    if (uid) {
      setOrgCache(uid, {
        org: nextOrg,
        orgRole: nextRole,
        permissions: nextPerms,
        me: meFromPayload(payload),
      })
    }
  }, [setAccountRole])

  const load = useCallback(async () => {
    if (!userId) {
      bootstrappedUserIdRef.current = null
      setBootstrappedUserId(null)
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
      setMe(null)
      setAccountRole?.(null)
      setFetching(false)
      setError(null)
      return
    }

    const snapshot = peekSession(userId)
    const cached = getOrgCache(userId)
    const hasSnapshot = sessionIsUsable(snapshot)
    if (hasSnapshot) {
      applyBootstrap(userId, snapshot)
    } else if (cached?.org) {
      setOrg((prev) => prev ?? cached.org)
      setOrgRole((prev) => prev ?? cached.orgRole)
      if (cached.permissions) setPermissionSession((prev) => prev ?? cached.permissions)
      if (cached.me) setMe((prev) => prev ?? cached.me)
    }

    if (!hasSnapshot) setFetching(true)

    setError(null)
    try {
      const data = await fetchSession(userId)
      applyBootstrap(userId, data)
      loadOrgBootstrap().catch(() => {})
    } catch (err) {
      console.error('[OrgProvider] session bootstrap failed:', err.message)
      setError(err.message)
      const fallback = getOrgCache(userId)
      if (fallback?.org) {
        setOrg(fallback.org)
        setOrgRole(fallback.orgRole)
        setPermissionSession(fallback.permissions || null)
        setMe(fallback.me || null)
        setBootstrappedUserId(userId)
        bootstrappedUserIdRef.current = userId
      } else if (!hasSnapshot) {
        setOrg(null)
        setOrgRole(null)
        setBootstrappedUserId(userId)
        bootstrappedUserIdRef.current = userId
        setPermissionSession(null)
      }
    } finally {
      setFetching(false)
    }
  }, [userId, applyBootstrap, bootstrapEpoch])

  useEffect(() => {
    if (bootstrapEpoch === 0) return
    bootstrappedUserIdRef.current = null
    setBootstrappedUserId(null)
  }, [bootstrapEpoch])

  useEffect(() => {
    load()
  }, [load])

  const hydrated = bootstrappedUserId === userId
  const liveOrg = hydrated ? org : (peeked?.org ?? org)
  const liveRole = hydrated ? orgRole : (peeked?.role ?? orgRole)
  const livePerms = hydrated ? permissionSession : (peeked?.permissions ?? permissionSession)
  const liveMe = hydrated ? me : (peeked ? meFromPayload(peeked) : me)
  const hasUsableSnapshot = Boolean(userId && (hydrated || sessionIsUsable(peeked)))
  const loading = Boolean(userId) && !hasUsableSnapshot && (fetching || bootstrappedUserId !== userId)

  const value = useMemo(() => ({
    org: liveOrg,
    orgRole: liveRole,
    permissionSession: livePerms,
    me: liveMe,
    loading,
    error,
    reload: () => load(),
    clear: () => {
      bootstrappedUserIdRef.current = null
      setBootstrappedUserId(null)
      clearOrgCache()
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
      setMe(null)
    },
  }), [liveOrg, liveRole, livePerms, liveMe, loading, error, load])

  return createElement(OrgContext.Provider, { value }, children)
}

export const useOrg = () => {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrg must be used inside OrgProvider')
  }
  return { org: ctx.org, orgRole: ctx.orgRole, loading: ctx.loading, error: ctx.error, reload: ctx.reload }
}

/** Full bootstrap context (permissions included) for PermissionsProvider. */
export const useOrgBootstrap = () => {
  const ctx = useContext(OrgContext)
  if (!ctx) {
    throw new Error('useOrgBootstrap must be used inside OrgProvider')
  }
  return ctx
}
