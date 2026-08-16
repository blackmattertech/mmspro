import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  ACCESS_MODULES,
  ACCESS_MODULE_GROUPS,
  emptyPermissions,
  normalizePermissionsInput,
} from '../../lib/accessModules.js'
import {
  resolveSessionPermissions,
  permissionMap,
} from '../../lib/orgPermissions.js'
import { getSignedUrl } from '../../lib/signedUrlCache.js'
import { invalidatePermissionsCache } from '../../lib/requestCache.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess)

const ORG_ASSETS_BUCKET = 'org-assets'
const ROLE_CARD_AVATAR_LIMIT = 4

async function attachEmployeePhotoUrl(employee) {
  if (!employee?.photo_url) return employee
  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, employee.photo_url)
  return { ...employee, photo_signed_url: signedUrl || null }
}

async function getEmployeeCountForRole(orgId, roleId) {
  const { count, error } = await supabaseAdmin
    .from('org_employees')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('access_role_id', roleId)

  if (error) throw error
  return count || 0
}

async function getPermissionsForRole(roleId) {
  const { data, error } = await supabaseAdmin
    .from('org_access_role_permissions')
    .select('module_key, can_create, can_read, can_update, can_delete')
    .eq('role_id', roleId)

  if (error) throw error
  return normalizePermissionsInput(data || [])
}

/** Batch-enrich roles: few queries total instead of N+1 per role. */
async function enrichRoles(orgId, roles) {
  if (!roles?.length) return []

  const roleIds = roles.map((r) => r.id)
  const locationIds = [...new Set(roles.map((r) => r.location_id).filter(Boolean))]

  const [permResult, empResult, locResult] = await Promise.all([
    supabaseAdmin
      .from('org_access_role_permissions')
      .select('role_id, module_key, can_create, can_read, can_update, can_delete')
      .in('role_id', roleIds),
    supabaseAdmin
      .from('org_employees')
      .select('id, name, emp_id, photo_url, location_id, access_role_id, org_locations:location_id ( id, name, code )')
      .eq('org_id', orgId)
      .in('access_role_id', roleIds)
      .order('name'),
    locationIds.length
      ? supabaseAdmin
          .from('org_locations')
          .select('id, name, code')
          .eq('org_id', orgId)
          .in('id', locationIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (permResult.error) throw permResult.error
  if (empResult.error) throw empResult.error
  if (locResult.error) throw locResult.error

  const permsByRole = new Map()
  for (const row of permResult.data || []) {
    if (!permsByRole.has(row.role_id)) permsByRole.set(row.role_id, [])
    permsByRole.get(row.role_id).push(row)
  }

  const employeesByRole = new Map()
  const allEmployees = empResult.data || []
  for (const emp of allEmployees) {
    if (!employeesByRole.has(emp.access_role_id)) employeesByRole.set(emp.access_role_id, [])
    employeesByRole.get(emp.access_role_id).push(emp)
  }

  const locationById = new Map((locResult.data || []).map((loc) => [loc.id, loc]))

  const sampleIds = []
  for (const roleId of roleIds) {
    const samples = (employeesByRole.get(roleId) || []).slice(0, ROLE_CARD_AVATAR_LIMIT)
    for (const emp of samples) sampleIds.push(emp.id)
  }

  const headedByEmployee = new Map()
  if (sampleIds.length) {
    const { data: headedLocations, error: headedError } = await supabaseAdmin
      .from('org_locations')
      .select('id, name, code, head_employee_id')
      .eq('org_id', orgId)
      .in('head_employee_id', sampleIds)
    if (headedError) throw headedError
    for (const location of headedLocations || []) {
      const existing = headedByEmployee.get(location.head_employee_id) || []
      existing.push({ id: location.id, name: location.name, code: location.code })
      headedByEmployee.set(location.head_employee_id, existing)
    }
  }

  return Promise.all(roles.map(async (role) => {
    const roleEmployees = employeesByRole.get(role.id) || []
    const samples = roleEmployees.slice(0, ROLE_CARD_AVATAR_LIMIT)
    const sample_employees = await Promise.all(samples.map(async (employee) => {
      const withPhoto = await attachEmployeePhotoUrl(employee)
      return {
        ...withPhoto,
        headed_locations: headedByEmployee.get(employee.id) || [],
      }
    }))

    return {
      ...role,
      location: role.location_id ? (locationById.get(role.location_id) || null) : null,
      permissions: normalizePermissionsInput(permsByRole.get(role.id) || []),
      employee_count: roleEmployees.length,
      sample_employees,
    }
  }))
}

async function enrichRole(orgId, role) {
  const [enriched] = await enrichRoles(orgId, [role])
  return enriched
}

async function syncRolePermissions(roleId, permissions) {
  const normalized = normalizePermissionsInput(permissions)

  const { error: deleteError } = await supabaseAdmin
    .from('org_access_role_permissions')
    .delete()
    .eq('role_id', roleId)

  if (deleteError) throw deleteError

  const rows = normalized.map((row) => ({
    role_id: roleId,
    module_key: row.module_key,
    can_create: row.can_create,
    can_read: row.can_read,
    can_update: row.can_update,
    can_delete: row.can_delete,
  }))

  if (!rows.length) {
    invalidatePermissionsCache()
    return normalized
  }

  const { error: insertError } = await supabaseAdmin
    .from('org_access_role_permissions')
    .insert(rows)

  if (insertError) throw insertError
  invalidatePermissionsCache()
  return normalized
}

/**
 * Org admins can always manage roles.
 * Other users need roles_access permissions on their assigned access role.
 */
async function getRolesCapability(req) {
  const session = req.orgPermissions || await resolveSessionPermissions(req.userProfile)
  req.orgPermissions = session

  const row = permissionMap(session.permissions).get('roles_access') || {
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
  }
  const canManage = row.can_create || row.can_update || row.can_delete

  return {
    is_org_admin: session.is_org_admin,
    location_id: session.location_id,
    can_create: Boolean(row.can_create),
    can_read: Boolean(row.can_read) || canManage,
    can_update: Boolean(row.can_update),
    can_delete: Boolean(row.can_delete),
    can_assign: Boolean(row.can_update) || Boolean(row.can_create),
  }
}

function requireCapability(action) {
  return async (req, res, next) => {
    try {
      const capability = await getRolesCapability(req)
      req.rolesCapability = capability

      const allowed = {
        create: capability.can_create,
        update: capability.can_update,
        delete: capability.can_delete,
        assign: capability.can_assign,
        read: capability.can_read,
      }[action]

      if (!allowed) {
        return res.status(403).json({
          error: 'Only org admins, or employees assigned Roles & Access permission by an admin, can do this',
        })
      }
      next()
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
}

function assertRoleInScope(role, capability, userId) {
  if (capability.is_org_admin) return true
  // Non-admins may only manage roles they created.
  if (!userId || !role?.created_by || role.created_by !== userId) return false
  return true
}

router.get('/modules', (_req, res) => {
  res.set('Cache-Control', 'private, max-age=60')
  res.json({ groups: ACCESS_MODULE_GROUPS, modules: ACCESS_MODULES })
})

router.get('/me', async (req, res) => {
  try {
    const session = await resolveSessionPermissions(req.userProfile)
    req.orgPermissions = session
    res.json(session)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/capabilities', async (req, res) => {
  try {
    const capability = await getRolesCapability(req)
    res.json(capability)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id

  try {
    const capability = await getRolesCapability(req)
    if (!capability.can_read) return res.json([])

    let query = supabaseAdmin
      .from('org_access_roles')
      .select('id, org_id, location_id, name, description, is_active, created_by, created_at, updated_at')
      .eq('org_id', orgId)
      .order('name')

    // Org admins see every role. Everyone else only sees roles they created.
    if (!capability.is_org_admin) {
      query = query.eq('created_by', userId)
    }

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const roles = await enrichRoles(orgId, data || [])
    res.json(roles)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireCapability('create'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  const { name, description, permissions } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Role name is required' })
  }

  // Access roles are org-wide. Employees are limited by their own location.
  const { data, error } = await supabaseAdmin
    .from('org_access_roles')
    .insert({
      org_id: orgId,
      location_id: null,
      name: name.trim(),
      description: description?.trim() || null,
      created_by: userId,
    })
    .select('id, org_id, location_id, name, description, is_active, created_by, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Role name already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    const normalized = await syncRolePermissions(
      data.id,
      permissions !== undefined ? permissions : emptyPermissions(),
    )
    const enriched = await enrichRole(orgId, data)
    res.status(201).json({ ...enriched, permissions: normalized })
  } catch (permError) {
    await supabaseAdmin.from('org_access_roles').delete().eq('id', data.id)
    res.status(500).json({ error: permError.message })
  }
})

router.patch('/:id', requireCapability('update'), assertOrgOwnership('org_access_roles'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  const capability = req.rolesCapability

  const { data: existingRole, error: existingError } = await supabaseAdmin
    .from('org_access_roles')
    .select('id, location_id, created_by')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (existingError || !existingRole) return res.status(404).json({ error: 'Role not found' })
  if (!assertRoleInScope(existingRole, capability, userId)) {
    return res.status(403).json({ error: 'You can only manage roles you created' })
  }

  const allowed = ['name', 'description', 'is_active']
  const updates = {}

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  const hasPermissionUpdate = req.body.permissions !== undefined

  if (!Object.keys(updates).length && !hasPermissionUpdate) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (updates.name !== undefined && !updates.name) {
    return res.status(400).json({ error: 'Role name is required' })
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('org_access_roles')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Role name already exists for this location' })
      return res.status(500).json({ error: error.message })
    }
  }

  if (hasPermissionUpdate) {
    try {
      await syncRolePermissions(req.params.id, req.body.permissions)
    } catch (permError) {
      return res.status(500).json({ error: permError.message })
    }
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from('org_access_roles')
    .select('id, org_id, location_id, name, description, is_active, created_by, created_at, updated_at')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (fetchError) return res.status(500).json({ error: fetchError.message })

  const enriched = await enrichRole(orgId, data)
  res.json(enriched)
})

router.delete('/:id', requireCapability('delete'), assertOrgOwnership('org_access_roles'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  const capability = req.rolesCapability

  const { data: existingRole, error: existingError } = await supabaseAdmin
    .from('org_access_roles')
    .select('id, location_id, created_by')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (existingError || !existingRole) return res.status(404).json({ error: 'Role not found' })
  if (!assertRoleInScope(existingRole, capability, userId)) {
    return res.status(403).json({ error: 'You can only manage roles you created' })
  }

  await supabaseAdmin
    .from('org_employees')
    .update({ access_role_id: null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('access_role_id', req.params.id)

  const { error } = await supabaseAdmin
    .from('org_access_roles')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) return res.status(500).json({ error: error.message })
  invalidatePermissionsCache()
  res.json({ ok: true })
})

router.post('/:id/assign-employees', requireCapability('assign'), assertOrgOwnership('org_access_roles'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const userId = req.userProfile.id
  const roleId = req.params.id
  const employeeIds = Array.isArray(req.body.employee_ids) ? req.body.employee_ids : null
  const capability = req.rolesCapability

  const { data: role, error: roleError } = await supabaseAdmin
    .from('org_access_roles')
    .select('id, location_id, created_by')
    .eq('id', roleId)
    .eq('org_id', orgId)
    .single()
  if (roleError || !role) return res.status(404).json({ error: 'Role not found' })
  if (!assertRoleInScope(role, capability, userId)) {
    return res.status(403).json({ error: 'You can only manage roles you created' })
  }

  if (!employeeIds) {
    return res.status(400).json({ error: 'employee_ids array is required' })
  }

  const uniqueIds = [...new Set(employeeIds.filter(Boolean))]

  if (uniqueIds.length) {
    const { data: employees, error: employeesError } = await supabaseAdmin
      .from('org_employees')
      .select('id, location_id')
      .eq('org_id', orgId)
      .in('id', uniqueIds)

    if (employeesError) return res.status(500).json({ error: employeesError.message })
    if ((employees || []).length !== uniqueIds.length) {
      return res.status(400).json({ error: 'One or more employees are invalid' })
    }
  }

  const { error: clearError } = await supabaseAdmin
    .from('org_employees')
    .update({ access_role_id: null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('access_role_id', roleId)

  if (clearError) return res.status(500).json({ error: clearError.message })

  if (uniqueIds.length) {
    const { error: assignError } = await supabaseAdmin
      .from('org_employees')
      .update({ access_role_id: roleId, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .in('id', uniqueIds)

    if (assignError) return res.status(500).json({ error: assignError.message })
  }

  invalidatePermissionsCache()
  const employee_count = await getEmployeeCountForRole(orgId, roleId)
  res.json({ employee_count, employee_ids: uniqueIds })
})

export default router
