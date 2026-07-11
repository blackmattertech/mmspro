import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { getMyPermissions } from '../lib/api-roles'
import {
  ACCESS_MODULES,
  emptyPermissions,
  MODULE_LEGACY_EXPAND,
  WORK_ORDER_MODULE_KEYS,
  REPORT_MODULE_KEYS,
  COMPANY_PAGE_MODULE_KEYS,
} from '../lib/accessModules'
import { useOrg } from './useOrg'
import { useAuth } from './useAuth'

const PermissionsContext = createContext(null)

const ACTION_KEY = {
  create: 'can_create',
  read: 'can_read',
  update: 'can_update',
  delete: 'can_delete',
}

export function PermissionsProvider({ children }) {
  const { user } = useAuth()
  const { org, loading: orgLoading } = useOrg()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!user || !org?.id) {
      setSession(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getMyPermissions()
      setSession(data)
    } catch (err) {
      setError(err.message)
      setSession({
        is_org_admin: false,
        location_id: null,
        employee_id: null,
        access_role: null,
        permissions: emptyPermissions(),
      })
    } finally {
      setLoading(false)
    }
  }, [user, org?.id])

  useEffect(() => {
    if (orgLoading) return
    load()
  }, [orgLoading, load])

  const value = useMemo(() => {
    const permissions = session?.permissions || emptyPermissions()
    const byModule = new Map(permissions.map((row) => [row.module_key, row]))

    const can = (moduleKey, action) => {
      if (session?.is_org_admin) return true
      const column = ACTION_KEY[action]
      if (!column) return false

      const granted = (key) => Boolean(byModule.get(key)?.[column])
      if (granted(moduleKey)) return true

      for (const [parent, children] of Object.entries(MODULE_LEGACY_EXPAND)) {
        if (children.includes(moduleKey) && granted(parent)) return true
        if (moduleKey === parent && children.some((child) => granted(child))) return true
      }

      if (moduleKey === 'work_orders' && WORK_ORDER_MODULE_KEYS.some((key) => granted(key))) {
        return true
      }
      if (moduleKey === 'reports' && REPORT_MODULE_KEYS.some((key) => granted(key))) {
        return true
      }

      return false
    }

    const firstReadablePath = (orgSlug) => {
      const order = [
        ['dashboard', 'dashboard'],
        ['work_orders_manual', 'work-orders/manual'],
        ['work_orders_received', 'work-orders/received'],
        ['work_orders', 'work-orders/manual'],
        ['calendar', 'calendar'],
        ['reports_daily_logs', 'reports/daily-logs'],
        ['reports', 'reports/daily-logs'],
        ['company', 'masters/company'],
        ['locations', 'masters/company'],
        ['employees', 'masters/company'],
        ['assets', 'masters/assets'],
        ['roles_access', 'configuration/roles'],
        ['settings', 'configuration/settings'],
      ]
      for (const [moduleKey, segment] of order) {
        if (can(moduleKey, 'read')) return `/${orgSlug}/${segment}`
      }
      return `/${orgSlug}/dashboard`
    }

    return {
      loading: orgLoading || loading,
      error,
      session,
      isOrgAdmin: Boolean(session?.is_org_admin),
      locationId: session?.location_id || null,
      accessRole: session?.access_role || null,
      permissions,
      modules: ACCESS_MODULES,
      can,
      canRead: (moduleKey) => can(moduleKey, 'read'),
      canCreate: (moduleKey) => can(moduleKey, 'create'),
      canUpdate: (moduleKey) => can(moduleKey, 'update'),
      canDelete: (moduleKey) => can(moduleKey, 'delete'),
      companyPageKeys: COMPANY_PAGE_MODULE_KEYS,
      firstReadablePath,
      reload: load,
    }
  }, [session, loading, orgLoading, error, load])

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    throw new Error('usePermissions must be used within PermissionsProvider')
  }
  return ctx
}
