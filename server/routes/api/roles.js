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

const router = Router()

router.use(verifyAuth, requireOrgAccess)

async function getPermissionsForRole(roleId) {
  const { data, error } = await supabaseAdmin
    .from('org_access_role_permissions')
    .select('module_key, can_create, can_read, can_update, can_delete')
    .eq('role_id', roleId)

  if (error) throw error
  return normalizePermissionsInput(data || [])
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

  if (!rows.length) return normalized

  const { error: insertError } = await supabaseAdmin
    .from('org_access_role_permissions')
    .insert(rows)

  if (insertError) throw insertError
  return normalized
}

const ORG_ASSETS_BUCKET = 'org-assets'
const ROLE_CARD_AVATAR_LIMIT = 4

async function attachEmployeePhotoUrl(employee) {
  if (!employee?.photo_url) return employee
  const { data } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(employee.photo_url, 3600)
  return { ...employee, photo_signed_url: data?.signedUrl || null }
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

async function getSampleEmployeesForRole(orgId, roleId) {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, name, emp_id, photo_url')
    .eq('org_id', orgId)
    .eq('access_role_id', roleId)
    .order('name')
    .limit(ROLE_CARD_AVATAR_LIMIT)

  if (error) throw error
  return Promise.all((data || []).map(attachEmployeePhotoUrl))
}

async function resolveLocation(orgId, locationId) {
  if (!locationId) return null
  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .select('id, name, code')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return data
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

async function enrichRole(orgId, role) {
  const [permissions, employee_count, location, sample_employees] = await Promise.all([
    getPermissionsForRole(role.id),
    getEmployeeCountForRole(orgId, role.id),
    resolveLocation(orgId, role.location_id),
    getSampleEmployeesForRole(orgId, role.id),
  ])
  return { ...role, location, permissions, employee_count, sample_employees }
}

router.get('/modules', (_req, res) => {
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

    const roles = await Promise.all((data || []).map((role) => enrichRole(orgId, role)))
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

  const employee_count = await getEmployeeCountForRole(orgId, roleId)
  res.json({ employee_count, employee_ids: uniqueIds })
})

export default router
