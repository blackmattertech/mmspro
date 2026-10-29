import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { getMyPermissions } from '../lib/api-roles'
import {
  ACCESS_MODULES,
  emptyPermissions,
  MODULE_LEGACY_EXPAND,
  MODULE_PARENT_GRANTS,
  WORK_ORDER_MODULE_KEYS,
  WORK_REQUEST_MODULE_KEYS,
  REPORT_MODULE_KEYS,
  COMPANY_PAGE_MODULE_KEYS,
} from '../lib/accessModules'
import {
  isEntitlementOnlyKey,
  isPermissionKeyEnabled,
  isProductModuleEnabled,
  normalizeDisabledModules,
} from '../lib/orgModules'
import { useOrgBootstrap } from './useOrg'
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
  const {
    org,
    loading: orgLoading,
    permissionSession: bootstrappedSession,
  } = useOrgBootstrap()
  const [session, setSession] = useState(bootstrappedSession)
  const [loading, setLoading] = useState(() => !bootstrappedSession)
  const [error, setError] = useState(null)

  const userId = user?.id ?? null
  const resolvedSession = session || bootstrappedSession

  const load = useCallback(async () => {
    if (!userId || !org?.id) {
      setSession(null)
      setLoading(false)
      return
    }

    // Prefer permissions already loaded by OrgProvider (/api/session)
    if (bootstrappedSession) {
      setSession(bootstrappedSession)
      setLoading(false)
      setError(null)
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
  }, [userId, org?.id, bootstrappedSession])

  useEffect(() => {
    if (orgLoading) return
    load()
  }, [orgLoading, load])

  const value = useMemo(() => {
    const permissions = resolvedSession?.permissions || emptyPermissions()
    const byModule = new Map(permissions.map((row) => [row.module_key, row]))
    const disabledModules = normalizeDisabledModules(
      resolvedSession?.disabled_modules ?? org?.disabled_modules,
    )

    const can = (moduleKey, action) => {
      if (!isPermissionKeyEnabled(disabledModules, moduleKey)) return false
      if (!resolvedSession) return false
      if (isEntitlementOnlyKey(moduleKey)) return true
      if (resolvedSession.is_org_admin) return true
      const column = ACTION_KEY[action]
      if (!column) return false

      const granted = (key) => Boolean(byModule.get(key)?.[column])
      if (granted(moduleKey)) return true

      for (const [parent, children] of Object.entries(MODULE_LEGACY_EXPAND)) {
        if (children.includes(moduleKey) && granted(parent)) return true
        if (moduleKey === parent && children.some((child) => granted(child))) return true
      }

      for (const [parent, children] of Object.entries(MODULE_PARENT_GRANTS)) {
        if (children.includes(moduleKey) && granted(parent)) return true
      }

      if (moduleKey === 'work_request' && WORK_REQUEST_MODULE_KEYS.some((key) => granted(key))) {
        return true
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
        ['work_request_create', 'work-request/create'],
        ['work_request_my', 'work-request/my'],
        ['work_request_incoming', 'work-request/incoming'],
        ['work_request_outgoing', 'work-request/outgoing'],
        ['work_request_all', 'work-request/all'],
        ['work_request', 'work-request'],
        ['work_orders_received', 'work-orders/received'],
        ['work_orders_assigned', 'work-orders/assigned'],
        ['work_orders_manual', 'work-orders/manual'],
        ['work_orders', 'work-orders'],
        ['work_orders_scheduled', 'work-orders/scheduled'],
        ['logbook', 'logbook'],
        ['calendar', 'calendar'],
        ['warranty_manager', 'warranty-manager/in-warranty'],
        ['tasks_followups', 'tasks-and-followups'],
        ['reports', 'reports'],
        ['company', 'masters/company'],
        ['locations', 'masters/company'],
        ['work_centers', 'masters/company'],
        ['employees', 'masters/company'],
        ['areas', 'masters/equipment'],
        ['assets', 'masters/forms'],
        ['equipment', 'masters/equipment'],
        ['vendors', 'masters/vendors'],
        ['others', 'masters/others'],
        ['roles_access', 'configuration/roles'],
        ['approvals', 'configuration/approvals'],
        ['settings', 'configuration/settings'],
        ['import', 'configuration/import'],
        ['export', 'configuration/export'],
      ]
      for (const [moduleKey, segment] of order) {
        if (can(moduleKey, 'read')) return `/${orgSlug}/${segment}`
      }
      return `/${orgSlug}/unavailable`
    }

    return {
      loading: orgLoading || (loading && !resolvedSession),
      error,
      session: resolvedSession,
      isOrgAdmin: Boolean(resolvedSession?.is_org_admin),
      locationId: resolvedSession?.location_id || null,
      accessRole: resolvedSession?.access_role || null,
      permissions,
      modules: ACCESS_MODULES,
      disabledModules,
      can,
      canRead: (moduleKey) => can(moduleKey, 'read'),
      canCreate: (moduleKey) => can(moduleKey, 'create'),
      canUpdate: (moduleKey) => can(moduleKey, 'update'),
      canDelete: (moduleKey) => can(moduleKey, 'delete'),
      isProductEnabled: (productId) => isProductModuleEnabled(disabledModules, productId),
      companyPageKeys: COMPANY_PAGE_MODULE_KEYS,
      firstReadablePath,
      reload: load,
    }
  }, [resolvedSession, loading, orgLoading, error, load, org?.disabled_modules])

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
