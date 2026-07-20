import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement, useRef } from 'react'
import { useAuth } from './useAuth'
import { getOrgCache, setOrgCache, clearOrgCache } from '../lib/orgCache'
import { apiFetch } from '../lib/api'

const OrgContext = createContext(null)

/**
 * Shared org + permissions bootstrap. One GET /api/session per user session
 * instead of N× useOrg fetches + separate permissions call.
 */
export function OrgProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [org, setOrg] = useState(null)
  const [orgRole, setOrgRole] = useState(null)
  const [permissionSession, setPermissionSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const bootstrappedUserIdRef = useRef(null)

  const applyBootstrap = useCallback((uid, payload) => {
    const nextOrg = payload?.org || null
    const nextRole = payload?.role || null
    const nextPerms = payload?.permissions || null
    setOrg(nextOrg)
    setOrgRole(nextRole)
    setPermissionSession(nextPerms)
    if (uid && nextOrg) {
      setOrgCache(uid, { org: nextOrg, orgRole: nextRole })
    }
  }, [])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!userId) {
      bootstrappedUserIdRef.current = null
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
      setLoading(false)
      setError(null)
      return
    }

    const alreadyReady = bootstrappedUserIdRef.current === userId
    const cached = getOrgCache(userId)
    if (cached?.org) {
      setOrg((prev) => prev ?? cached.org)
      setOrgRole((prev) => prev ?? cached.orgRole)
    }

    // Only gate the UI on the first bootstrap for this user.
    // Silent/same-user refreshes must not unmount open forms/modals.
    if (!silent && !alreadyReady) {
      setLoading(true)
    }

    setError(null)
    try {
      const data = await apiFetch('/api/session')
      applyBootstrap(userId, data)
      bootstrappedUserIdRef.current = userId
    } catch (err) {
      console.error('[OrgProvider] session bootstrap failed:', err.message)
      setError(err.message)
      // Keep cached org if API fails so routing still works
      const fallback = getOrgCache(userId)
      if (fallback?.org) {
        setOrg(fallback.org)
        setOrgRole(fallback.orgRole)
        bootstrappedUserIdRef.current = userId
      } else {
        setOrg(null)
        setOrgRole(null)
        bootstrappedUserIdRef.current = null
      }
      setPermissionSession(null)
    } finally {
      setLoading(false)
    }
  }, [userId, applyBootstrap])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo(() => ({
    org,
    orgRole,
    permissionSession,
    loading,
    error,
    reload: (opts) => load({ silent: true, ...opts }),
    clear: () => {
      bootstrappedUserIdRef.current = null
      clearOrgCache()
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
    },
  }), [org, orgRole, permissionSession, loading, error, load])

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
