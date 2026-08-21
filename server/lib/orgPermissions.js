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
import { permissionsCache, permissionsCacheKey } from './requestCache.js'

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
    .select('id, location_id, department_id, access_role_id, name, emp_id')
    .eq('org_id', orgId)
    .eq('profile_id', profile.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (byProfile) return byProfile

  const email = profile.email?.trim()
  if (!email) return null

  const { data: byEmail, error: emailError } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, department_id, access_role_id, name, emp_id')
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

export function isLocationHeadRoleName(name) {
  return String(name || '').trim().toLowerCase() === 'location head'
}

export function isDepartmentHeadRoleName(name) {
  return String(name || '').trim().toLowerCase().includes('department head')
}

async function loadHeadFlags(orgId, employee, accessRole) {
  const roleName = accessRole?.name || ''
  const is_department_head = isDepartmentHeadRoleName(roleName)
  let is_location_head = isLocationHeadRoleName(roleName)

  if (!is_location_head && orgId && employee?.id) {
    const { data, error } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('org_id', orgId)
      .eq('head_employee_id', employee.id)
      .limit(1)
    if (error) throw error
    is_location_head = Boolean(data?.length)
  }

  return { is_location_head, is_department_head }
}

export function employeeInAssignScope(employee, capability) {
  if (!employee) return false
  if (capability?.is_org_admin) return true
  if (capability?.is_location_head) {
    return !capability.location_id || employee.location_id === capability.location_id
  }
  if (capability?.is_department_head) {
    if (capability.department_id && employee.department_id === capability.department_id) return true
    if (capability.employee_id && employee.manager_id === capability.employee_id) return true
    if (capability.employee_id && employee.id === capability.employee_id) return true
    return false
  }
  if (capability?.location_id) return employee.location_id === capability.location_id
  return true
}

const DEPARTMENT_HEAD_DEFAULT_GRANTS = {
  work_request_incoming: { can_read: true, can_update: true },
  work_request_approve: { can_update: true },
  work_orders_received: { can_read: true, can_update: true },
  work_orders_approve: { can_update: true },
  employees: { can_read: true },
  roles_access: { can_create: true, can_read: true, can_update: true, can_delete: true },
}

function withDepartmentHeadDefaults(permissions) {
  return (permissions || []).map((row) => {
    const extra = DEPARTMENT_HEAD_DEFAULT_GRANTS[row.module_key]
    if (!extra) return row
    return {
      ...row,
      can_create: Boolean(row.can_create || extra.can_create),
      can_read: Boolean(row.can_read || extra.can_read),
      can_update: Boolean(row.can_update || extra.can_update),
      can_delete: Boolean(row.can_delete || extra.can_delete),
    }
  })
}

/**
 * Resolve the current user's full access-role matrix for an org.
 * Org admins (account admin / super_admin) get full permissions.
 * Results are cached briefly to avoid repeating 2–4 DB queries on every API call.
 */
export async function resolveSessionPermissions(profile) {
  const cacheKey = permissionsCacheKey(profile)
  if (cacheKey) {
    const cached = permissionsCache.get(cacheKey)
    if (cached) return cached
  }

  const orgId = profile?.org_id
  if (!orgId) {
    return {
      is_org_admin: false,
      location_id: null,
      department_id: null,
      employee_id: null,
      access_role: null,
      is_location_head: false,
      is_department_head: false,
      permissions: emptyPermissions(),
    }
  }

  const orgAdmin = canManageOrg(profile?.role)
  const employee = await getLinkedEmployee(orgId, profile)
  const locationId = employee?.location_id || null
  const departmentId = employee?.department_id || null
  const accessRole = employee?.access_role_id
    ? await getAccessRoleMeta(employee.access_role_id)
    : null
  const headFlags = await loadHeadFlags(orgId, employee, accessRole)

  let session
  if (orgAdmin) {
    session = {
      is_org_admin: true,
      location_id: locationId,
      department_id: departmentId,
      employee_id: employee?.id || null,
      access_role: accessRole,
      ...headFlags,
      permissions: allTruePermissions(),
    }
  } else {
    session = {
      is_org_admin: false,
      location_id: locationId,
      department_id: departmentId,
      employee_id: employee?.id || null,
      access_role: accessRole,
      ...headFlags,
      permissions: await getPermissionsForRole(employee?.access_role_id),
    }
    if (headFlags.is_department_head) {
      session.permissions = withDepartmentHeadDefaults(session.permissions)
    }
  }

  if (cacheKey) permissionsCache.set(cacheKey, session)
  return session
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

/** Non-admins are limited to their employee location when set.
 * Company admins and access role "Admin" can use all locations.
 */
export function getScopedLocationId(session) {
  if (!session || session.is_org_admin) return null
  const roleName = session.access_role?.name?.trim().toLowerCase() || ''
  if (roleName === 'admin') return null
  return session.location_id || null
}

/** Prefer the caller's scoped location over any requested filter. */
export function resolveLocationFilter(session, requestedLocationId) {
  const scoped = getScopedLocationId(session)
  if (scoped) return scoped
  return requestedLocationId || null
}

export function assertLocationAccess(session, locationId, message = 'You can only access records at your location') {
  const scoped = getScopedLocationId(session)
  if (!scoped) return
  if (locationId !== scoped) {
    const err = new Error(message)
    err.status = 403
    throw err
  }
}

export function coerceScopedLocationId(session, requestedLocationId) {
  const scoped = getScopedLocationId(session)
  if (!scoped) return requestedLocationId || null
  if (requestedLocationId && requestedLocationId !== scoped) {
    const err = new Error('You can only use your assigned location')
    err.status = 403
    throw err
  }
  return scoped
}
