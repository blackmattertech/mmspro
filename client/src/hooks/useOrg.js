import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement } from 'react'
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
  const [org, setOrg] = useState(null)
  const [orgRole, setOrgRole] = useState(null)
  const [permissionSession, setPermissionSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const applyBootstrap = useCallback((userId, payload) => {
    const nextOrg = payload?.org || null
    const nextRole = payload?.role || null
    const nextPerms = payload?.permissions || null
    setOrg(nextOrg)
    setOrgRole(nextRole)
    setPermissionSession(nextPerms)
    if (userId && nextOrg) {
      setOrgCache(userId, { org: nextOrg, orgRole: nextRole })
    }
  }, [])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!user) {
      setOrg(null)
      setOrgRole(null)
      setPermissionSession(null)
      setLoading(false)
      setError(null)
      return
    }

    const userId = user.id
    if (!silent) {
      const cached = getOrgCache(userId)
      if (cached?.org) {
        setOrg(cached.org)
        setOrgRole(cached.orgRole)
        setLoading(true)
      } else {
        setLoading(true)
      }
    }

    setError(null)
    try {
      const data = await apiFetch('/api/session')
      applyBootstrap(userId, data)
    } catch (err) {
      console.error('[OrgProvider] session bootstrap failed:', err.message)
      setError(err.message)
      // Keep cached org if API fails so routing still works
      const cached = getOrgCache(userId)
      if (cached?.org) {
        setOrg(cached.org)
        setOrgRole(cached.orgRole)
      } else {
        setOrg(null)
        setOrgRole(null)
      }
      setPermissionSession(null)
    } finally {
      setLoading(false)
    }
  }, [user, applyBootstrap])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo(() => ({
    org,
    orgRole,
    permissionSession,
    loading,
    error,
    reload: load,
    clear: () => {
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
