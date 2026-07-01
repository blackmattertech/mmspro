import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import { requireOrgRole } from '../../middleware/orgRole.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { provisionEmployeeLogin, disableEmployeeLogin } from '../../lib/provisionEmployeeLogin.js'

const router = Router()
const canManage = requireOrgRole('owner', 'admin')

const ORG_SELECT = `
  id, name, slug, plan, is_active,
  email, phone, website,
  address_line1, address_line2, city, state, postal_code, country,
  tax_id, currency, logo_url,
  created_at, updated_at
`

router.use(verifyAuth, requireOrgAccess)

const ORG_ASSETS_BUCKET = 'org-assets'

function isValidLogoPath(path, orgId) {
  if (!path) return true
  return path.startsWith(`${orgId}/`) && !path.includes('..')
}

async function attachLogoSignedUrl(org) {
  if (!org?.logo_url) return org

  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(org.logo_url, 3600)

  if (!error && data?.signedUrl) {
    return { ...org, logo_signed_url: data.signedUrl }
  }
  return org
}

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select(ORG_SELECT)
    .eq('id', req.userProfile.org_id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const withLogo = await attachLogoSignedUrl(data)
  res.json(withLogo)
})

router.patch('/', canManage, async (req, res) => {
  const allowed = [
    'name', 'email', 'phone', 'website',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country',
    'tax_id', 'currency', 'logo_url',
  ]

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key]
    }
  }

  if (updates.logo_url !== undefined) {
    const path = updates.logo_url
    if (path === '' || path === null) {
      updates.logo_url = null
    } else if (!isValidLogoPath(path, req.userProfile.org_id)) {
      return res.status(400).json({ error: 'Invalid logo path' })
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', req.userProfile.org_id)
    .select(ORG_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const withLogo = await attachLogoSignedUrl(data)
  res.json(withLogo)
})

// ── Locations ──

router.get('/locations', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .select('*')
    .eq('org_id', req.userProfile.org_id)
    .order('is_primary', { ascending: false })
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/locations', canManage, async (req, res) => {
  const { name, code, address_line1, address_line2, city, state, postal_code, country, is_primary } = req.body

  if (!name?.trim() || !code?.trim()) {
    return res.status(400).json({ error: 'Name and code are required' })
  }

  const orgId = req.userProfile.org_id
  const normalizedCode = code.trim().toUpperCase()

  if (is_primary) {
    await supabaseAdmin
      .from('org_locations')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
  }

  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .insert({
      org_id: orgId,
      name: name.trim(),
      code: normalizedCode,
      address_line1: address_line1?.trim() || null,
      address_line2: address_line2?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      postal_code: postal_code?.trim() || null,
      country: country?.trim() || null,
      is_primary: Boolean(is_primary),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Location code already exists' })
    return res.status(500).json({ error: error.message })
  }

  res.status(201).json(data)
})

router.patch('/locations/:id', canManage, assertOrgOwnership('org_locations'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const allowed = [
    'name', 'code', 'address_line1', 'address_line2',
    'city', 'state', 'postal_code', 'country', 'is_primary', 'is_active',
  ]

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'code') updates[key] = String(req.body[key]).trim().toUpperCase()
      else if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (updates.is_primary) {
    await supabaseAdmin
      .from('org_locations')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .neq('id', req.params.id)
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Location code already exists' })
    return res.status(500).json({ error: error.message })
  }

  res.json(data)
})

router.delete('/locations/:id', canManage, assertOrgOwnership('org_locations'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── Departments ──

router.get('/departments', async (req, res) => {
  let query = supabaseAdmin
    .from('departments')
    .select('*, org_locations(id, name, code)')
    .eq('org_id', req.userProfile.org_id)
    .order('name')

  if (req.query.location_id) {
    query = query.or(`location_id.eq.${req.query.location_id},all_locations.eq.true`)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/departments', canManage, async (req, res) => {
  const { name, description, location_id, parent_id, all_locations } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }

  const orgId = req.userProfile.org_id
  const appliesToAll = Boolean(all_locations)

  if (!appliesToAll && location_id) {
    const { data: loc } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('id', location_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!loc) return res.status(400).json({ error: 'Invalid location' })
  }

  if (parent_id) {
    const { data: parent } = await supabaseAdmin
      .from('departments')
      .select('id')
      .eq('id', parent_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) return res.status(400).json({ error: 'Invalid parent department' })
  }

  const { data, error } = await supabaseAdmin
    .from('departments')
    .insert({
      org_id: orgId,
      name: name.trim(),
      description: description?.trim() || null,
      all_locations: appliesToAll,
      location_id: appliesToAll ? null : (location_id || null),
      parent_id: parent_id || null,
    })
    .select('*, org_locations(id, name, code)')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.status(201).json(data)
})

router.patch('/departments/:id', canManage, assertOrgOwnership('departments'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const allowed = ['name', 'description', 'location_id', 'parent_id', 'is_active', 'all_locations']

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (updates.all_locations) {
    updates.all_locations = true
    updates.location_id = null
  } else if (updates.all_locations === false) {
    updates.all_locations = false
  }

  if (!updates.all_locations && updates.location_id) {
    const { data: loc } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('id', updates.location_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!loc) return res.status(400).json({ error: 'Invalid location' })
  }

  if (updates.parent_id) {
    if (updates.parent_id === req.params.id) {
      return res.status(400).json({ error: 'Department cannot be its own parent' })
    }
    const { data: parent } = await supabaseAdmin
      .from('departments')
      .select('id')
      .eq('id', updates.parent_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) return res.status(400).json({ error: 'Invalid parent department' })
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('departments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select('*, org_locations(id, name, code)')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  res.json(data)
})

router.delete('/departments/:id', canManage, assertOrgOwnership('departments'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select('*, org_locations(id, name, code)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── Designations ──

const DESIGNATION_SELECT = `
  *,
  designation_departments (
    departments ( id, name )
  )
`

function formatDesignation(row) {
  if (!row) return row
  const departments = (row.designation_departments || [])
    .map((link) => link.departments)
    .filter(Boolean)
  const { designation_departments: _links, ...rest } = row
  return { ...rest, departments }
}

async function validateDepartmentIds(orgId, departmentIds) {
  if (!departmentIds?.length) return []

  const { data, error } = await supabaseAdmin
    .from('departments')
    .select('id')
    .eq('org_id', orgId)
    .in('id', departmentIds)

  if (error) throw error
  if (data.length !== departmentIds.length) {
    throw new Error('Invalid department')
  }
  return departmentIds
}

async function syncDesignationDepartments(orgId, designationId, allDepartments, departmentIds) {
  const appliesToAll = Boolean(allDepartments)

  if (appliesToAll) {
    await supabaseAdmin
      .from('designation_departments')
      .delete()
      .eq('designation_id', designationId)

    const { error } = await supabaseAdmin
      .from('designations')
      .update({ all_departments: true, updated_at: new Date().toISOString() })
      .eq('id', designationId)
      .eq('org_id', orgId)

    if (error) throw error
    return
  }

  const validIds = await validateDepartmentIds(orgId, departmentIds)
  if (!validIds.length) {
    throw new Error('Select at least one department or choose all departments')
  }

  const { error: flagError } = await supabaseAdmin
    .from('designations')
    .update({ all_departments: false, updated_at: new Date().toISOString() })
    .eq('id', designationId)
    .eq('org_id', orgId)

  if (flagError) throw flagError

  await supabaseAdmin
    .from('designation_departments')
    .delete()
    .eq('designation_id', designationId)

  const { error: linkError } = await supabaseAdmin
    .from('designation_departments')
    .insert(validIds.map((department_id) => ({ designation_id: designationId, department_id })))

  if (linkError) throw linkError
}

async function getDesignationById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('designations')
    .select(DESIGNATION_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error) throw error
  return formatDesignation(data)
}

async function getDesignationsForOrg(orgId, departmentId) {
  let query = supabaseAdmin
    .from('designations')
    .select(DESIGNATION_SELECT)
    .eq('org_id', orgId)
    .order('hierarchy')

  const { data, error } = await query

  if (error) throw error

  let rows = (data || []).map(formatDesignation)

  if (departmentId) {
    rows = rows.filter((row) =>
      row.all_departments
      || row.departments?.some((dept) => dept.id === departmentId),
    )
  }

  return rows
}

async function reassignDesignationHierarchy(orgId, orderedIds) {
  const now = new Date().toISOString()

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin
      .from('designations')
      .update({ hierarchy: -(i + 1), updated_at: now })
      .eq('id', orderedIds[i])
      .eq('org_id', orgId)
    if (error) throw error
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin
      .from('designations')
      .update({ hierarchy: i + 1, updated_at: now })
      .eq('id', orderedIds[i])
      .eq('org_id', orgId)
    if (error) throw error
  }
}

async function moveDesignation(orgId, id, targetHierarchy) {
  const all = await getDesignationsForOrg(orgId)
  const fromIndex = all.findIndex((d) => d.id === id)
  if (fromIndex === -1) throw new Error('Designation not found')

  const reordered = [...all]
  const [item] = reordered.splice(fromIndex, 1)
  const toIndex = Math.max(0, Math.min(targetHierarchy - 1, reordered.length))
  reordered.splice(toIndex, 0, item)

  await reassignDesignationHierarchy(orgId, reordered.map((d) => d.id))
  return reordered
}

router.get('/designations', async (req, res) => {
  try {
    const data = await getDesignationsForOrg(req.userProfile.org_id, req.query.department_id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/designations', canManage, async (req, res) => {
  const { name, description, all_departments, department_ids } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }

  const orgId = req.userProfile.org_id
  const all = await getDesignationsForOrg(orgId)
  const nextHierarchy = all.length ? Math.max(...all.map((d) => d.hierarchy)) + 1 : 1
  const appliesToAll = all_departments !== false

  try {
    if (!appliesToAll) {
      await validateDepartmentIds(orgId, department_ids)
      if (!department_ids?.length) {
        return res.status(400).json({ error: 'Select at least one department or choose all departments' })
      }
    }
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const { data, error } = await supabaseAdmin
    .from('designations')
    .insert({
      org_id: orgId,
      name: name.trim(),
      description: description?.trim() || null,
      hierarchy: nextHierarchy,
      all_departments: appliesToAll,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Designation name already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    if (!appliesToAll) {
      await syncDesignationDepartments(orgId, data.id, false, department_ids)
    }
    const full = await getDesignationById(orgId, data.id)
    res.status(201).json(full)
  } catch (syncError) {
    res.status(500).json({ error: syncError.message })
  }
})

router.put('/designations/reorder', canManage, async (req, res) => {
  const { ids } = req.body
  const orgId = req.userProfile.org_id

  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' })
  }

  try {
    const all = await getDesignationsForOrg(orgId)
    if (ids.length !== all.length) {
      return res.status(400).json({ error: 'Reorder must include all designations' })
    }

    const known = new Set(all.map((d) => d.id))
    if (ids.some((id) => !known.has(id))) {
      return res.status(400).json({ error: 'Invalid designation id in order' })
    }

    await reassignDesignationHierarchy(orgId, ids)
    const data = await getDesignationsForOrg(orgId)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.patch('/designations/:id', canManage, assertOrgOwnership('designations'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const allowed = ['name', 'description', 'hierarchy', 'is_active', 'all_departments']

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  const departmentIds = req.body.department_ids
  const hasDepartmentMapping = req.body.all_departments !== undefined || departmentIds !== undefined

  if (!Object.keys(updates).length && !hasDepartmentMapping && req.body.hierarchy === undefined) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const hierarchy = updates.hierarchy
  delete updates.hierarchy

  if (hierarchy !== undefined) {
    const target = parseInt(hierarchy, 10)
    if (!Number.isFinite(target) || target < 1) {
      return res.status(400).json({ error: 'Hierarchy must be a positive number' })
    }
    try {
      await moveDesignation(orgId, req.params.id, target)
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('designations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Designation name already exists' })
      return res.status(500).json({ error: error.message })
    }
  }

  if (hasDepartmentMapping) {
    const { data: current } = await supabaseAdmin
      .from('designations')
      .select('all_departments')
      .eq('id', req.params.id)
      .eq('org_id', orgId)
      .single()

    const appliesToAll = req.body.all_departments !== undefined
      ? Boolean(req.body.all_departments)
      : current?.all_departments !== false

    try {
      await syncDesignationDepartments(orgId, req.params.id, appliesToAll, departmentIds)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
  }

  try {
    const data = await getDesignationById(orgId, req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.delete('/designations/:id', canManage, assertOrgOwnership('designations'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { data, error } = await supabaseAdmin
    .from('designations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  try {
    const all = await getDesignationsForOrg(orgId)
    await reassignDesignationHierarchy(orgId, all.map((d) => d.id))
  } catch {
    // soft delete succeeded; hierarchy compaction is best-effort
  }

  res.json(data)
})

// ── Employees ──

const EMPLOYEE_SELECT = `
  *,
  designations ( id, name ),
  departments ( id, name ),
  org_locations ( id, name, code )
`

function isValidEmployeePhotoPath(path, orgId) {
  if (!path) return true
  return path.startsWith(`${orgId}/employees/`) && !path.includes('..')
}

async function attachEmployeePhotoUrl(employee) {
  if (!employee?.photo_url) return employee

  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(employee.photo_url, 3600)

  if (!error && data?.signedUrl) {
    return { ...employee, photo_signed_url: data.signedUrl }
  }
  return employee
}

async function getEmployeeById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select(EMPLOYEE_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error) throw error
  return attachEmployeePhotoUrl(data)
}

async function getOrgName(orgId) {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  return data?.name || 'your organization'
}

async function handleEmployeeLoginAccess(orgId, employeeId, {
  loginRequired,
  email,
  employeeName,
  wasLoginRequired,
  emailChanged,
}) {
  if (!loginRequired) {
    await disableEmployeeLogin(employeeId, orgId)
    return { emailSent: false }
  }

  if (!email?.trim()) {
    throw new Error('Email is required when login is enabled')
  }

  const shouldSendEmail = !wasLoginRequired || emailChanged
  if (!shouldSendEmail && wasLoginRequired) {
    await supabaseAdmin
      .from('org_employees')
      .update({ login_required: true, updated_at: new Date().toISOString() })
      .eq('id', employeeId)
      .eq('org_id', orgId)
    return { emailSent: false }
  }

  const orgName = await getOrgName(orgId)
  const result = await provisionEmployeeLogin({
    email,
    orgId,
    orgName,
    employeeName,
    employeeId,
  })
  return result
}

async function validateEmployeeRefs(orgId, refs) {
  const { designation_id, department_id, location_id } = refs

  if (location_id) {
    const { data } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('id', location_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid location')
  }

  if (department_id) {
    const { data } = await supabaseAdmin
      .from('departments')
      .select('id')
      .eq('id', department_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid department')
  }

  if (designation_id) {
    const { data } = await supabaseAdmin
      .from('designations')
      .select('id')
      .eq('id', designation_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid designation')
  }
}

router.get('/employees', async (req, res) => {
  let query = supabaseAdmin
    .from('org_employees')
    .select(EMPLOYEE_SELECT)
    .eq('org_id', req.userProfile.org_id)
    .order('name')

  if (req.query.department_id) query = query.eq('department_id', req.query.department_id)
  if (req.query.location_id) query = query.eq('location_id', req.query.location_id)
  if (req.query.designation_id) query = query.eq('designation_id', req.query.designation_id)

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  const withPhotos = await Promise.all((data || []).map(attachEmployeePhotoUrl))
  res.json(withPhotos)
})

router.post('/employees', canManage, async (req, res) => {
  const {
    emp_id, name, mobile, email,
    designation_id, department_id, location_id, photo_url,
    login_required,
  } = req.body

  if (!emp_id?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Employee ID and name are required' })
  }

  if (login_required && !email?.trim()) {
    return res.status(400).json({ error: 'Email is required when login is enabled' })
  }

  const orgId = req.userProfile.org_id

  try {
    await validateEmployeeRefs(orgId, { designation_id, department_id, location_id })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (photo_url && !isValidEmployeePhotoPath(photo_url, orgId)) {
    return res.status(400).json({ error: 'Invalid photo path' })
  }

  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .insert({
      org_id: orgId,
      emp_id: emp_id.trim(),
      name: name.trim(),
      mobile: mobile?.trim() || null,
      email: email?.trim() || null,
      designation_id: designation_id || null,
      department_id: department_id || null,
      location_id: location_id || null,
      photo_url: photo_url || null,
      login_required: Boolean(login_required),
    })
    .select(EMPLOYEE_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Employee ID already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    if (login_required) {
      await handleEmployeeLoginAccess(orgId, data.id, {
        loginRequired: true,
        email: email?.trim(),
        employeeName: name.trim(),
        wasLoginRequired: false,
        emailChanged: true,
      })
    }
    const withPhoto = await getEmployeeById(orgId, data.id)
    res.status(201).json(withPhoto)
  } catch (loginError) {
    res.status(400).json({ error: loginError.message })
  }
})

router.patch('/employees/:id', canManage, assertOrgOwnership('org_employees'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const allowed = [
    'emp_id', 'name', 'mobile', 'email',
    'designation_id', 'department_id', 'location_id',
    'photo_url', 'is_active', 'login_required',
  ]

  const { data: current, error: currentError } = await supabaseAdmin
    .from('org_employees')
    .select('login_required, email, name')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (currentError) return res.status(500).json({ error: currentError.message })

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  const loginRequired = req.body.login_required
  const hasLoginChange = loginRequired !== undefined

  if (!Object.keys(updates).length && !hasLoginChange) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (loginRequired && !(updates.email ?? current.email)?.trim()) {
    return res.status(400).json({ error: 'Email is required when login is enabled' })
  }

  if (updates.photo_url !== undefined) {
    const path = updates.photo_url
    if (path === '' || path === null) {
      updates.photo_url = null
    } else if (!isValidEmployeePhotoPath(path, orgId)) {
      return res.status(400).json({ error: 'Invalid photo path' })
    }
  }

  try {
    await validateEmployeeRefs(orgId, {
      designation_id: updates.designation_id,
      department_id: updates.department_id,
      location_id: updates.location_id,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString()

    const { error } = await supabaseAdmin
      .from('org_employees')
      .update(updates)
      .eq('id', req.params.id)
      .eq('org_id', orgId)

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Employee ID already exists' })
      return res.status(500).json({ error: error.message })
    }
  }

  try {
    if (hasLoginChange) {
      const nextEmail = (updates.email ?? current.email)?.trim()
      const emailChanged = updates.email !== undefined
        && updates.email?.trim().toLowerCase() !== current.email?.trim().toLowerCase()

      await handleEmployeeLoginAccess(orgId, req.params.id, {
        loginRequired: Boolean(loginRequired),
        email: nextEmail,
        employeeName: (updates.name ?? current.name)?.trim(),
        wasLoginRequired: Boolean(current.login_required),
        emailChanged,
      })
    }

    const withPhoto = await getEmployeeById(orgId, req.params.id)
    res.json(withPhoto)
  } catch (loginError) {
    res.status(400).json({ error: loginError.message })
  }
})

router.delete('/employees/:id', canManage, assertOrgOwnership('org_employees'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select(EMPLOYEE_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const withPhoto = await attachEmployeePhotoUrl(data)
  res.json(withPhoto)
})

export default router
