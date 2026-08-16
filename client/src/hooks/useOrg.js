import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement, useRef } from 'react'
import { useAuth } from './useAuth'
import { getOrgCache, setOrgCache, clearOrgCache } from '../lib/orgCache'
import { fetchSession, peekSession } from '../lib/session'

const OrgContext = createContext(null)

/**
 * Shared org + permissions bootstrap. One GET /api/session per user session
 * instead of N× useOrg fetches + separate permissions call.
 */
export function OrgProvider({ children }) {
  const { user, setAccountRole, bootstrapEpoch } = useAuth()
  const userId = user?.id ?? null
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
    setMe({
      profile: payload?.profile || null,
      employee: payload?.employee || null,
      avatarUrl: payload?.avatar_url || null,
    })
    setAccountRole?.(nextRole)
    setBootstrappedUserId(uid || null)
    bootstrappedUserIdRef.current = uid || null
    if (uid && nextOrg) {
      setOrgCache(uid, { org: nextOrg, orgRole: nextRole })
    }
  }, [setAccountRole])

  const load = useCallback(async ({ silent = false } = {}) => {
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

    const peeked = peekSession()
    if (peeked?.org) {
      applyBootstrap(userId, peeked)
    } else {
      const cached = getOrgCache(userId)
      if (cached?.org) {
        setOrg((prev) => prev ?? cached.org)
        setOrgRole((prev) => prev ?? cached.orgRole)
      }
    }

    if (!silent) setFetching(true)

    setError(null)
    try {
      const data = await fetchSession()
      applyBootstrap(userId, data)
    } catch (err) {
      console.error('[OrgProvider] session bootstrap failed:', err.message)
      setError(err.message)
      const fallback = getOrgCache(userId)
      if (fallback?.org) {
        setOrg(fallback.org)
        setOrgRole(fallback.orgRole)
        setBootstrappedUserId(userId)
        bootstrappedUserIdRef.current = userId
      } else {
        setOrg(null)
        setOrgRole(null)
        setBootstrappedUserId(userId)
        bootstrappedUserIdRef.current = userId
      }
      setPermissionSession(null)
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

  const loading = Boolean(userId) && (fetching || bootstrappedUserId !== userId)

  const value = useMemo(() => ({
    org,
    orgRole,
    permissionSession,
    me,
    loading,
    error,
    reload: (opts) => load({ silent: true, ...opts }),
    clear: () => {
      bootstrappedUserIdRef.current = null
      setBootstrappedUserId(null)
      clearOrgCache()
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
      setMe(null)
    },
  }), [org, orgRole, permissionSession, me, loading, error, load])

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
