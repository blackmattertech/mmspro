import { supabaseAdmin } from '../services/supabase.js'
import {
  ACCESS_MODULES,
  emptyPermissions,
  normalizePermissionsInput,
  MODULE_LEGACY_EXPAND,
  WORK_ORDER_MODULE_KEYS,
  REPORT_MODULE_KEYS,
} from './accessModules.js'
import { canManageOrg } from './accountRoles.js'

const ACTION_COLUMNS = {
  create: 'can_create',
  read: 'can_read',
  update: 'can_update',
  delete: 'can_delete',
}

export function allTruePermissions() {
  return ACCESS_MODULES.map((mod) => ({
    module_key: mod.key,
    can_create: mod.actions.includes('create'),
    can_read: mod.actions.includes('read'),
    can_update: mod.actions.includes('update'),
    can_delete: mod.actions.includes('delete'),
  }))
}

export async function getLinkedEmployee(orgId, profile) {
  if (!profile?.id) return null

  const { data: byProfile, error: profileError } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, access_role_id, name, emp_id')
    .eq('org_id', orgId)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (byProfile) return byProfile

  const email = profile.email?.trim()
  if (!email) return null

  const { data: byEmail, error: emailError } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, access_role_id, name, emp_id')
    .eq('org_id', orgId)
    .ilike('email', email)
    .maybeSingle()

  if (emailError) throw emailError
  return byEmail || null
}

async function getPermissionsForRole(roleId) {
  if (!roleId) return emptyPermissions()

  const { data, error } = await supabaseAdmin
    .from('org_access_role_permissions')
    .select('module_key, can_create, can_read, can_update, can_delete')
    .eq('role_id', roleId)

  if (error) throw error
  return normalizePermissionsInput(data || [])
}

async function getAccessRoleMeta(roleId) {
  if (!roleId) return null
  const { data, error } = await supabaseAdmin
    .from('org_access_roles')
    .select('id, name')
    .eq('id', roleId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Resolve the current user's full access-role matrix for an org.
 * Org admins (account admin / super_admin) get full permissions.
 */
export async function resolveSessionPermissions(profile) {
  const orgId = profile?.org_id
  if (!orgId) {
    return {
      is_org_admin: false,
      location_id: null,
      employee_id: null,
      access_role: null,
      permissions: emptyPermissions(),
    }
  }

  const orgAdmin = canManageOrg(profile?.role)
  const employee = await getLinkedEmployee(orgId, profile)
  const locationId = employee?.location_id || null

  if (orgAdmin) {
    return {
      is_org_admin: true,
      location_id: locationId,
      employee_id: employee?.id || null,
      access_role: employee?.access_role_id
        ? await getAccessRoleMeta(employee.access_role_id)
        : null,
      permissions: allTruePermissions(),
    }
  }

  const permissions = await getPermissionsForRole(employee?.access_role_id)
  const accessRole = await getAccessRoleMeta(employee?.access_role_id)

  return {
    is_org_admin: false,
    location_id: locationId,
    employee_id: employee?.id || null,
    access_role: accessRole,
    permissions,
  }
}

export function permissionMap(permissions) {
  const map = new Map()
  for (const row of permissions || []) {
    map.set(row.module_key, row)
  }
  return map
}

export function hasModulePermission(session, moduleKey, action) {
  if (!session) return false
  if (session.is_org_admin) return true

  const column = ACTION_COLUMNS[action]
  if (!column) return false

  const map = permissionMap(session.permissions)

  const granted = (key) => Boolean(map.get(key)?.[column])

  if (granted(moduleKey)) return true

  // Legacy parent key still stored on older roles.
  for (const [parent, children] of Object.entries(MODULE_LEGACY_EXPAND)) {
    if (children.includes(moduleKey) && granted(parent)) return true
    if (moduleKey === parent && children.some((child) => granted(child))) return true
  }

  // API often checks the family parent (work_orders / reports).
  if (moduleKey === 'work_orders' && WORK_ORDER_MODULE_KEYS.some((key) => granted(key))) {
    return true
  }
  if (moduleKey === 'reports' && REPORT_MODULE_KEYS.some((key) => granted(key))) {
    return true
  }

  return false
}

export function hasAnyModulePermission(session, checks) {
  return (checks || []).some(([moduleKey, action]) => hasModulePermission(session, moduleKey, action))
}

/** Non-admins are limited to their employee location when set. */
export function getScopedLocationId(session) {
  if (!session || session.is_org_admin) return null
  return session.location_id || null
}
