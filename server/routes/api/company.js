import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { provisionEmployeeLogin, disableEmployeeLogin } from '../../lib/provisionEmployeeLogin.js'
import { validatePostalCode, validatePhoneE164, normalizePhoneE164 } from '../../lib/contactValidation.js'
import { searchIndianAddresses } from '../../lib/addressGeocoder.js'
import {
  assertUnderLimit,
  assertUnderLimitIfReactivating,
  assertLoginSlotAvailable,
  getOrgLimitsSummary,
} from '../../lib/orgLimits.js'
import { getScopedLocationId, hasModulePermission } from '../../lib/orgPermissions.js'
import { canManageOrg } from '../../lib/accountRoles.js'

const router = Router()

const canReadCompany = requireAnyModulePermission([
  ['company', 'read'],
  ['locations', 'read'],
  ['departments', 'read'],
  ['designations', 'read'],
  ['employees', 'read'],
  ['employees', 'create'],
  ['employees', 'update'],
  ['assets', 'read'],
  ['work_orders', 'read'],
])
const canUpdateCompany = requireModulePermission('company', 'update')

const canReadLocations = requireAnyModulePermission([
  ['locations', 'read'],
  ['employees', 'read'],
  ['employees', 'create'],
  ['work_orders', 'read'],
  ['work_orders', 'create'],
])
const canCreateLocations = requireModulePermission('locations', 'create')
const canUpdateLocations = requireModulePermission('locations', 'update')
const canDeleteLocations = requireModulePermission('locations', 'delete')

const canReadDepartments = requireAnyModulePermission([
  ['departments', 'read'],
  ['employees', 'read'],
  ['employees', 'create'],
  ['work_orders', 'read'],
  ['work_orders', 'create'],
])
const canCreateDepartments = requireModulePermission('departments', 'create')
const canUpdateDepartments = requireModulePermission('departments', 'update')
const canDeleteDepartments = requireModulePermission('departments', 'delete')

const canReadDesignations = requireAnyModulePermission([
  ['designations', 'read'],
  ['employees', 'read'],
  ['employees', 'create'],
])
const canCreateDesignations = requireModulePermission('designations', 'create')
const canUpdateDesignations = requireModulePermission('designations', 'update')
const canDeleteDesignations = requireModulePermission('designations', 'delete')

const canListEmployees = requireAnyModulePermission([
  ['employees', 'read'],
  ['employees', 'create'],
  ['employees', 'update'],
  ['work_orders', 'read'],
  ['work_orders', 'create'],
  ['roles_access', 'read'],
  ['roles_access', 'create'],
  ['roles_access', 'update'],
])
const canCreateEmployees = requireModulePermission('employees', 'create')
const canUpdateEmployees = requireModulePermission('employees', 'update')
const canDeleteEmployees = requireModulePermission('employees', 'delete')

const ORG_SELECT = `
  id, name, slug, plan, is_active,
  email, phone, website,
  address_line1, address_line2, city, state, postal_code, country,
  tax_id, currency, logo_url,
  created_at, updated_at
`

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

router.get('/geocode', async (req, res) => {
  const q = req.query.q?.trim()
  if (!q || q.length < 3) return res.json([])

  try {
    const results = await searchIndianAddresses(q)
    res.json(results)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Address search failed' })
  }
})

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

router.get('/', canReadCompany, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select(ORG_SELECT)
    .eq('id', req.userProfile.org_id)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  const withLogo = await attachLogoSignedUrl(data)
  const { limits, usage } = await getOrgLimitsSummary(req.userProfile.org_id)
  res.json({ ...withLogo, limits, usage })
})

router.patch('/', canUpdateCompany, async (req, res) => {
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

  if (updates.phone !== undefined) {
    const phoneError = validatePhoneE164(updates.phone)
    if (phoneError) return res.status(400).json({ error: phoneError })
    updates.phone = normalizePhoneE164(updates.phone)
  }

  if (updates.postal_code !== undefined) {
    let countryForPostal = updates.country
    if (countryForPostal === undefined) {
      const { data: currentOrg } = await supabaseAdmin
        .from('organizations')
        .select('country')
        .eq('id', req.userProfile.org_id)
        .single()
      countryForPostal = currentOrg?.country
    }
    const postalError = validatePostalCode(updates.postal_code, countryForPostal)
    if (postalError) return res.status(400).json({ error: postalError })
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

const LOCATION_SELECT = `
  *,
  head_employee:head_employee_id ( id, emp_id, name, photo_url )
`

async function attachLocationHeadPhoto(location) {
  if (!location) return location
  let result = { ...location }
  if (location.head_employee) {
    result.head_employee = await attachEmployeePhotoUrl(location.head_employee)
  }
  return result
}

async function validateLocationHead(orgId, locationId, headEmployeeId) {
  if (!headEmployeeId) return

  const { data: emp, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, is_active')
    .eq('id', headEmployeeId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!emp || emp.is_active === false) throw new Error('Invalid location head')
  if (emp.location_id !== locationId) {
    throw new Error('Location head must be an employee at this location')
  }
}

router.get('/locations', canReadLocations, async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  let query = supabaseAdmin
    .from('org_locations')
    .select(LOCATION_SELECT)
    .eq('org_id', req.userProfile.org_id)
    .order('is_primary', { ascending: false })
    .order('name')
    .range(offset, offset + limit - 1)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const forAssignment = req.query.for_assignment === '1'
    && hasModulePermission(req.orgPermissions, 'work_orders', 'create')
  if (scopedLocationId && !forAssignment) {
    query = query.eq('id', scopedLocationId)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  const withHeads = await Promise.all((data || []).map(attachLocationHeadPhoto))
  res.json(withHeads)
})

router.post('/locations', canCreateLocations, async (req, res) => {
  const { name, code, address_line1, address_line2, city, state, postal_code, country, is_primary } = req.body

  if (!name?.trim() || !code?.trim()) {
    return res.status(400).json({ error: 'Name and code are required' })
  }

  const orgId = req.userProfile.org_id
  const normalizedCode = code.trim().toUpperCase()

  const postalError = validatePostalCode(postal_code, country)
  if (postalError) return res.status(400).json({ error: postalError })

  try {
    await assertUnderLimit(orgId, 'location')
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

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

router.patch('/locations/:id', canUpdateLocations, assertOrgOwnership('org_locations'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { data: currentLocation, error: currentLocationError } = await supabaseAdmin
    .from('org_locations')
    .select('is_active')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (currentLocationError) return res.status(500).json({ error: currentLocationError.message })

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

  if (req.body.head_employee_id !== undefined) {
    updates.head_employee_id = req.body.head_employee_id || null
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (updates.head_employee_id !== undefined) {
    try {
      await validateLocationHead(orgId, req.params.id, updates.head_employee_id)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  if (updates.is_active === true) {
    try {
      await assertUnderLimitIfReactivating(
        orgId,
        'location',
        currentLocation.is_active,
        true,
      )
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
  }

  if (updates.postal_code !== undefined) {
    let countryForPostal = updates.country
    if (countryForPostal === undefined) {
      const { data: currentLoc } = await supabaseAdmin
        .from('org_locations')
        .select('country')
        .eq('id', req.params.id)
        .eq('org_id', orgId)
        .single()
      countryForPostal = currentLoc?.country
    }
    const postalError = validatePostalCode(updates.postal_code, countryForPostal)
    if (postalError) return res.status(400).json({ error: postalError })
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
    .select(LOCATION_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Location code already exists' })
    return res.status(500).json({ error: error.message })
  }

  res.json(await attachLocationHeadPhoto(data))
})

router.delete('/locations/:id', canDeleteLocations, assertOrgOwnership('org_locations'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('org_locations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select(LOCATION_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(await attachLocationHeadPhoto(data))
})

// ── Departments ──

const DEPARTMENT_SELECT = `
  *,
  org_locations!location_id ( id, name, code ),
  head_employee:head_employee_id ( id, emp_id, name, photo_url ),
  department_location_heads (
    id,
    location_id,
    head_employee_id,
    org_locations:location_id ( id, name, code ),
    head_employee:head_employee_id ( id, emp_id, name, photo_url )
  )
`

async function formatDepartmentLocationHeadRow(row) {
  if (!row) return row
  const head_employee = row.head_employee
    ? await attachEmployeePhotoUrl(row.head_employee)
    : null
  return {
    location_id: row.location_id,
    head_employee_id: row.head_employee_id,
    org_locations: row.org_locations,
    head_employee,
  }
}

async function attachDepartmentHeadData(department) {
  if (!department) return department

  let result = { ...department }

  if (department.head_employee) {
    result.head_employee = await attachEmployeePhotoUrl(department.head_employee)
  }

  if (department.department_location_heads?.length) {
    const location_heads = await Promise.all(
      department.department_location_heads.map(formatDepartmentLocationHeadRow),
    )
    const { department_location_heads: _rows, ...rest } = result
    result = { ...rest, location_heads }
  }

  return result
}

async function attachDepartmentHeadPhotos(departments) {
  return Promise.all((departments || []).map(attachDepartmentHeadData))
}

async function syncDepartmentLocationHeads(orgId, departmentId, perLocationHeads, locationHeads = []) {
  const { error: deleteError } = await supabaseAdmin
    .from('department_location_heads')
    .delete()
    .eq('department_id', departmentId)
    .eq('org_id', orgId)

  if (deleteError) throw deleteError

  if (!perLocationHeads) return

  const rows = (locationHeads || [])
    .filter((entry) => entry?.location_id && entry?.head_employee_id)
    .map((entry) => ({
      org_id: orgId,
      department_id: departmentId,
      location_id: entry.location_id,
      head_employee_id: entry.head_employee_id,
    }))

  if (!rows.length) return

  const { error: insertError } = await supabaseAdmin
    .from('department_location_heads')
    .insert(rows)

  if (insertError) throw insertError
}

async function validateDepartmentHeadPayload(orgId, {
  all_locations,
  location_id,
  per_location_heads,
  head_employee_id,
  location_heads,
}) {
  if (!all_locations) {
    if (head_employee_id) {
      await validateDepartmentHead(orgId, head_employee_id, { all_locations, location_id })
    }
    return
  }

  if (per_location_heads) {
    for (const entry of location_heads || []) {
      if (!entry?.head_employee_id) continue
      await validateDepartmentHead(orgId, entry.head_employee_id, {
        all_locations: false,
        location_id: entry.location_id,
      })
    }
    return
  }

  if (head_employee_id) {
    await validateDepartmentHead(orgId, head_employee_id, { all_locations: true, location_id: null })
  }
}

async function getDepartmentById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .select(DEPARTMENT_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error) throw error
  return attachDepartmentHeadData(data)
}

router.get('/departments', canReadDepartments, async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  let query = supabaseAdmin
    .from('departments')
    .select(DEPARTMENT_SELECT)
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = req.query.location_id || scopedLocationId
  if (locationFilter) {
    query = query.or(`location_id.eq.${locationFilter},all_locations.eq.true`)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  const withHeadPhotos = await attachDepartmentHeadPhotos(data)
  res.json(withHeadPhotos)
})

router.post('/departments', canCreateDepartments, async (req, res) => {
  const {
    name, code, description, location_id, parent_id, all_locations,
    head_employee_id, per_location_heads, location_heads,
  } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }

  if (!code?.trim()) {
    return res.status(400).json({ error: 'Code is required' })
  }

  const orgId = req.userProfile.org_id
  const appliesToAll = Boolean(all_locations)
  const usePerLocationHeads = appliesToAll && Boolean(per_location_heads)
  const normalizedCode = code.trim().toUpperCase()

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

  try {
    await validateDepartmentHeadPayload(orgId, {
      all_locations: appliesToAll,
      location_id: appliesToAll ? null : (location_id || null),
      per_location_heads: usePerLocationHeads,
      head_employee_id: usePerLocationHeads ? null : (head_employee_id || null),
      location_heads,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  try {
    await assertUnderLimit(orgId, 'department')
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const { data, error } = await supabaseAdmin
    .from('departments')
    .insert({
      org_id: orgId,
      name: name.trim(),
      code: normalizedCode,
      description: description?.trim() || null,
      all_locations: appliesToAll,
      location_id: appliesToAll ? null : (location_id || null),
      parent_id: parent_id || null,
      per_location_heads: usePerLocationHeads,
      head_employee_id: usePerLocationHeads ? null : (head_employee_id || null),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Department code already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    await syncDepartmentLocationHeads(orgId, data.id, usePerLocationHeads, location_heads)
    const created = await getDepartmentById(orgId, data.id)
    res.status(201).json(created)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

router.patch('/departments/:id', canUpdateDepartments, assertOrgOwnership('departments'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { data: currentDepartment, error: currentDepartmentError } = await supabaseAdmin
    .from('departments')
    .select('is_active')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (currentDepartmentError) return res.status(500).json({ error: currentDepartmentError.message })

  const allowed = [
    'name', 'code', 'description', 'location_id', 'parent_id',
    'is_active', 'all_locations', 'head_employee_id', 'per_location_heads',
  ]

  const locationHeads = req.body.location_heads

  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (key === 'code') updates[key] = String(req.body[key]).trim().toUpperCase()
      else if (typeof req.body[key] === 'string') updates[key] = req.body[key].trim()
      else updates[key] = req.body[key]
    }
  }

  if (!Object.keys(updates).length && locationHeads === undefined) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (updates.is_active === true) {
    try {
      await assertUnderLimitIfReactivating(
        orgId,
        'department',
        currentDepartment.is_active,
        true,
      )
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
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

  const { data: existingDept, error: existingDeptError } = await supabaseAdmin
    .from('departments')
    .select('location_id, all_locations, head_employee_id, per_location_heads')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (existingDeptError) return res.status(500).json({ error: existingDeptError.message })

  const nextAllLocations = updates.all_locations ?? existingDept.all_locations
  const nextLocationId = nextAllLocations ? null : (updates.location_id ?? existingDept.location_id)
  const nextPerLocationHeads = nextAllLocations
    ? (updates.per_location_heads ?? existingDept.per_location_heads)
    : false
  const nextHeadId = nextPerLocationHeads
    ? null
    : (updates.head_employee_id !== undefined
      ? updates.head_employee_id
      : existingDept.head_employee_id)

  if (updates.head_employee_id === '') {
    updates.head_employee_id = null
  }

  if (!nextAllLocations) {
    updates.per_location_heads = false
  } else if (updates.per_location_heads !== undefined) {
    updates.per_location_heads = Boolean(updates.per_location_heads)
  }

  if (nextPerLocationHeads) {
    updates.head_employee_id = null
  } else if (nextAllLocations && updates.per_location_heads === false) {
    updates.head_employee_id = nextHeadId
  }

  const shouldSyncLocationHeads = locationHeads !== undefined
    || updates.per_location_heads !== undefined
    || updates.all_locations !== undefined

  try {
    await validateDepartmentHeadPayload(orgId, {
      all_locations: nextAllLocations,
      location_id: nextLocationId,
      per_location_heads: nextPerLocationHeads,
      head_employee_id: nextPerLocationHeads ? null : nextHeadId,
      location_heads: locationHeads,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  updates.updated_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('departments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Department code already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    if (shouldSyncLocationHeads) {
      await syncDepartmentLocationHeads(
        orgId,
        req.params.id,
        nextPerLocationHeads,
        locationHeads,
      )
    } else if (!nextAllLocations || !nextPerLocationHeads) {
      await syncDepartmentLocationHeads(orgId, req.params.id, false, [])
    }

    const updated = await getDepartmentById(orgId, req.params.id)
    res.json(updated)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

router.delete('/departments/:id', canDeleteDepartments, assertOrgOwnership('departments'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('departments')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select(DEPARTMENT_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const withHeadPhoto = await attachDepartmentHeadData(data)
  res.json(withHeadPhoto)
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

router.get('/designations', canReadDesignations, async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  try {
    const data = await getDesignationsForOrg(req.userProfile.org_id, req.query.department_id)
    const pageData = data.slice(offset, offset + limit)
    res.json(pageData)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post('/designations', canCreateDesignations, async (req, res) => {
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

router.put('/designations/reorder', canUpdateDesignations, async (req, res) => {
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

router.patch('/designations/:id', canUpdateDesignations, assertOrgOwnership('designations'), async (req, res) => {
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

router.delete('/designations/:id', canDeleteDesignations, assertOrgOwnership('designations'), async (req, res) => {
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
  departments!department_id ( id, name, code ),
  org_locations!location_id ( id, name, code ),
  org_employee_emails ( id, email ),
  manager:manager_id ( id, emp_id, name ),
  headed_departments:departments!head_employee_id ( id, name, code ),
  access_role:access_role_id ( id, name )
`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmailList(emails) {
  const seen = new Set()
  const normalized = []
  for (const raw of emails || []) {
    const email = raw?.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    normalized.push(email)
  }
  return normalized
}

async function validateAdditionalEmails(orgId, employeeId, primaryEmail, additionalEmails) {
  const primary = primaryEmail?.trim().toLowerCase() || ''
  const normalized = normalizeEmailList(additionalEmails)

  for (const email of normalized) {
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Invalid email: ${email}`)
    }
    if (primary && email === primary) {
      throw new Error('Additional emails cannot include the primary email')
    }
  }

  if (!normalized.length) return normalized

  const { data: employees, error: employeesError } = await supabaseAdmin
    .from('org_employees')
    .select('id, email')
    .eq('org_id', orgId)

  if (employeesError) throw employeesError

  for (const emp of employees || []) {
    if (emp.id === employeeId) continue
    const empEmail = emp.email?.trim().toLowerCase()
    if (empEmail && normalized.includes(empEmail)) {
      throw new Error(`${empEmail} is already the primary email for another employee`)
    }
  }

  const { data: conflicts, error: conflictsError } = await supabaseAdmin
    .from('org_employee_emails')
    .select('email, employee_id')
    .eq('org_id', orgId)
    .in('email', normalized)

  if (conflictsError) throw conflictsError

  for (const row of conflicts || []) {
    if (row.employee_id !== employeeId) {
      throw new Error(`${row.email} is already assigned to another employee`)
    }
  }

  return normalized
}

async function syncEmployeeEmails(orgId, employeeId, additionalEmails) {
  const normalized = normalizeEmailList(additionalEmails)

  const { error: deleteError } = await supabaseAdmin
    .from('org_employee_emails')
    .delete()
    .eq('employee_id', employeeId)
    .eq('org_id', orgId)

  if (deleteError) throw deleteError

  if (!normalized.length) return

  const rows = normalized.map((email) => ({
    org_id: orgId,
    employee_id: employeeId,
    email,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('org_employee_emails')
    .insert(rows)

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error('One or more emails are already in use')
    }
    throw insertError
  }
}

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

/** Merge per-location department heads and location-head flags onto employee rows. */
async function attachEmployeeHeadMeta(orgId, employees) {
  const list = (Array.isArray(employees) ? employees : [employees]).filter(Boolean)
  if (!list.length) return employees

  const ids = list.map((employee) => employee.id).filter(Boolean)
  if (!ids.length) return employees

  const [
    { data: locationDeptHeads, error: locationDeptError },
    { data: headedLocations, error: headedLocationsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('department_location_heads')
      .select('head_employee_id, department_id, departments:department_id ( id, name, code )')
      .eq('org_id', orgId)
      .in('head_employee_id', ids),
    supabaseAdmin
      .from('org_locations')
      .select('id, name, code, head_employee_id')
      .eq('org_id', orgId)
      .in('head_employee_id', ids),
  ])

  if (locationDeptError) throw locationDeptError
  if (headedLocationsError) throw headedLocationsError

  const headedDeptsByEmployee = new Map()
  for (const row of locationDeptHeads || []) {
    if (!row?.departments) continue
    const existing = headedDeptsByEmployee.get(row.head_employee_id) || []
    if (!existing.some((dept) => dept.id === row.departments.id)) {
      existing.push(row.departments)
    }
    headedDeptsByEmployee.set(row.head_employee_id, existing)
  }

  const headedLocationsByEmployee = new Map()
  for (const location of headedLocations || []) {
    const existing = headedLocationsByEmployee.get(location.head_employee_id) || []
    existing.push({ id: location.id, name: location.name, code: location.code })
    headedLocationsByEmployee.set(location.head_employee_id, existing)
  }

  const enriched = list.map((employee) => {
    const fromLocationHeads = headedDeptsByEmployee.get(employee.id) || []
    const mergedDepartments = [...(employee.headed_departments || [])]
    for (const dept of fromLocationHeads) {
      if (!mergedDepartments.some((existing) => existing.id === dept.id)) {
        mergedDepartments.push(dept)
      }
    }
    const locations = headedLocationsByEmployee.get(employee.id) || []
    const accessRoleName = employee.access_role?.name?.trim().toLowerCase() || ''
    return {
      ...employee,
      headed_departments: mergedDepartments,
      headed_locations: locations,
      is_location_head: locations.length > 0 || accessRoleName === 'location head',
    }
  })

  return Array.isArray(employees) ? enriched : enriched[0]
}

async function decorateEmployees(orgId, employees) {
  const withPhotos = Array.isArray(employees)
    ? await Promise.all(employees.map(attachEmployeePhotoUrl))
    : await attachEmployeePhotoUrl(employees)
  return attachEmployeeHeadMeta(orgId, withPhotos)
}

async function getEmployeeById(orgId, id) {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .select(EMPLOYEE_SELECT)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error) throw error
  return decorateEmployees(orgId, data)
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
  forceEmail = false,
}) {
  if (!loginRequired) {
    await disableEmployeeLogin(employeeId, orgId)
    return { emailSent: false }
  }

  if (!email?.trim()) {
    throw new Error('Email is required when login is enabled')
  }

  const { data: employeeRow, error: employeeLookupError } = await supabaseAdmin
    .from('org_employees')
    .select('profile_id, login_required')
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (employeeLookupError) throw employeeLookupError

  const needsProvision = !employeeRow?.profile_id
  // Always email when login is turned back on (disable → enable), email changes,
  // first-time provision, or an explicit force (e.g. employee reactivated).
  const isLoginReEnable = Boolean(loginRequired) && !wasLoginRequired
  const shouldSendEmail = forceEmail || isLoginReEnable || emailChanged || needsProvision

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

async function validateEmployeeRefs(orgId, refs, actor = null) {
  const { designation_id, department_id, location_id, manager_id, employee_id, access_role_id } = refs

  if (manager_id) {
    if (employee_id && manager_id === employee_id) {
      throw new Error('Employee cannot be their own manager')
    }
    const { data } = await supabaseAdmin
      .from('org_employees')
      .select('id')
      .eq('id', manager_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid manager')
  }

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

  if (access_role_id) {
    const { data } = await supabaseAdmin
      .from('org_access_roles')
      .select('id, created_by')
      .eq('id', access_role_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid access role')
    // Non-admins may only assign roles they created (admins see/assign all).
    if (actor && !canManageOrg(actor.role) && data.created_by !== actor.id) {
      throw new Error('You can only assign access roles you created')
    }
  }
}

async function validateDepartmentHead(orgId, headEmployeeId, department = null) {
  if (!headEmployeeId) return

  const { data: emp, error } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id')
    .eq('id', headEmployeeId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!emp) throw new Error('Invalid department head')

  if (!department) return

  if (department.all_locations) {
    if (!emp.location_id) {
      throw new Error('Department head must have a location assigned')
    }
    return
  }

  if (department.location_id && emp.location_id !== department.location_id) {
    throw new Error('Department head must be at the same location as the department')
  }
}

async function syncEmployeeDepartmentHead(orgId, employeeId, departmentId, isDepartmentHead) {
  const { data: employee, error: employeeError } = await supabaseAdmin
    .from('org_employees')
    .select('id, location_id, department_id')
    .eq('id', employeeId)
    .eq('org_id', orgId)
    .single()

  if (employeeError || !employee) throw new Error('Employee not found')

  if (isDepartmentHead) {
    if (!departmentId) {
      throw new Error('Select a department before assigning as department head')
    }

    const { data: dept, error: deptError } = await supabaseAdmin
      .from('departments')
      .select('id, location_id, all_locations, per_location_heads')
      .eq('id', departmentId)
      .eq('org_id', orgId)
      .single()

    if (deptError || !dept) throw new Error('Invalid department')

    await validateDepartmentHead(orgId, employeeId, dept)

    if (dept.per_location_heads) {
      if (!employee.location_id) {
        throw new Error('Department head must have a location assigned')
      }

      const { error: clearSelfError } = await supabaseAdmin
        .from('department_location_heads')
        .delete()
        .eq('org_id', orgId)
        .eq('department_id', departmentId)
        .eq('head_employee_id', employeeId)

      if (clearSelfError) throw clearSelfError

      const { error: clearLocationError } = await supabaseAdmin
        .from('department_location_heads')
        .delete()
        .eq('org_id', orgId)
        .eq('department_id', departmentId)
        .eq('location_id', employee.location_id)

      if (clearLocationError) throw clearLocationError

      const { error: insertError } = await supabaseAdmin
        .from('department_location_heads')
        .insert({
          org_id: orgId,
          department_id: departmentId,
          location_id: employee.location_id,
          head_employee_id: employeeId,
        })

      if (insertError) throw insertError

      await supabaseAdmin
        .from('departments')
        .update({ head_employee_id: null, updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('head_employee_id', employeeId)

      return
    }

    await supabaseAdmin
      .from('departments')
      .update({ head_employee_id: null, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('head_employee_id', employeeId)

    const { error } = await supabaseAdmin
      .from('departments')
      .update({ head_employee_id: employeeId, updated_at: new Date().toISOString() })
      .eq('id', departmentId)
      .eq('org_id', orgId)

    if (error) throw error
    return
  }

  let clearQuery = supabaseAdmin
    .from('departments')
    .update({ head_employee_id: null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('head_employee_id', employeeId)

  if (departmentId) {
    clearQuery = clearQuery.eq('id', departmentId)
  }

  const { error: clearDeptError } = await clearQuery
  if (clearDeptError) throw clearDeptError

  let clearLocationHeads = supabaseAdmin
    .from('department_location_heads')
    .delete()
    .eq('org_id', orgId)
    .eq('head_employee_id', employeeId)

  if (departmentId) {
    clearLocationHeads = clearLocationHeads.eq('department_id', departmentId)
  }

  const { error: clearHeadsError } = await clearLocationHeads
  if (clearHeadsError) throw clearHeadsError
}

router.get('/employees', canListEmployees, async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  let query = supabaseAdmin
    .from('org_employees')
    .select(EMPLOYEE_SELECT)
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  if (req.query.department_id) query = query.eq('department_id', req.query.department_id)
  if (req.query.designation_id) query = query.eq('designation_id', req.query.designation_id)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const forAssignment = req.query.for_assignment === '1'
    && hasModulePermission(req.orgPermissions, 'work_orders', 'create')
  if (scopedLocationId && !forAssignment) {
    query = query.eq('location_id', scopedLocationId)
  } else if (req.query.location_id) {
    query = query.eq('location_id', req.query.location_id)
  }

  const { data, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  const withPhotos = await decorateEmployees(req.userProfile.org_id, data || [])
  res.json(withPhotos)
})

router.post('/employees', canCreateEmployees, async (req, res) => {
  const {
    emp_id, name, mobile, email,
    designation_id, department_id, location_id, photo_url,
    login_required, additional_emails, manager_id, is_department_head,
    access_role_id,
  } = req.body

  if (!emp_id?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Employee ID and name are required' })
  }

  if (login_required && !email?.trim()) {
    return res.status(400).json({ error: 'Email is required when login is enabled' })
  }

  const orgId = req.userProfile.org_id

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  let resolvedLocationId = location_id || null
  if (scopedLocationId) {
    if (resolvedLocationId && resolvedLocationId !== scopedLocationId) {
      return res.status(403).json({ error: 'You can only create employees at your location' })
    }
    resolvedLocationId = scopedLocationId
  }

  try {
    await validateEmployeeRefs(orgId, {
      designation_id, department_id, location_id: resolvedLocationId, manager_id, access_role_id,
    }, req.userProfile)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (photo_url && !isValidEmployeePhotoPath(photo_url, orgId)) {
    return res.status(400).json({ error: 'Invalid photo path' })
  }

  try {
    await validateAdditionalEmails(orgId, null, email, additional_emails)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const mobileError = validatePhoneE164(mobile)
  if (mobileError) return res.status(400).json({ error: mobileError })
  const normalizedMobile = normalizePhoneE164(mobile)

  try {
    await assertUnderLimit(orgId, 'employee')
    if (login_required) {
      await assertLoginSlotAvailable(orgId, { email: email?.trim() })
    }
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .insert({
      org_id: orgId,
      emp_id: emp_id.trim(),
      name: name.trim(),
      mobile: normalizedMobile,
      email: email?.trim() || null,
      designation_id: designation_id || null,
      department_id: department_id || null,
      location_id: resolvedLocationId || null,
      manager_id: manager_id || null,
      access_role_id: access_role_id || null,
      photo_url: photo_url || null,
      // Set true only after password email succeeds (see handleEmployeeLoginAccess).
      login_required: false,
    })
    .select(EMPLOYEE_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Employee ID already exists' })
    return res.status(500).json({ error: error.message })
  }

  try {
    if (additional_emails !== undefined) {
      await syncEmployeeEmails(orgId, data.id, additional_emails)
    }

    let loginEmailSent = false
    if (login_required) {
      const loginResult = await handleEmployeeLoginAccess(orgId, data.id, {
        loginRequired: true,
        email: email?.trim(),
        employeeName: name.trim(),
        wasLoginRequired: false,
        emailChanged: true,
      })
      loginEmailSent = Boolean(loginResult?.emailSent)
    }

    if (is_department_head !== undefined) {
      await syncEmployeeDepartmentHead(
        orgId,
        data.id,
        department_id || null,
        Boolean(is_department_head),
      )
    }

    const withPhoto = await getEmployeeById(orgId, data.id)
    res.status(201).json({
      ...withPhoto,
      ...(login_required ? { login_email_sent: loginEmailSent } : {}),
    })
  } catch (loginError) {
    res.status(400).json({ error: loginError.message })
  }
})

router.patch('/employees/:id', canUpdateEmployees, assertOrgOwnership('org_employees'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const allowed = [
    'emp_id', 'name', 'mobile', 'email',
    'designation_id', 'department_id', 'location_id', 'manager_id',
    'photo_url', 'is_active', 'login_required', 'access_role_id',
  ]

  const { data: current, error: currentError } = await supabaseAdmin
    .from('org_employees')
    .select('login_required, email, name, department_id, is_active, location_id')
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

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  if (scopedLocationId && current.location_id !== scopedLocationId) {
    return res.status(403).json({ error: 'You can only update employees at your location' })
  }
  if (scopedLocationId && updates.location_id && updates.location_id !== scopedLocationId) {
    return res.status(403).json({ error: 'You can only assign employees to your location' })
  }

  const loginRequired = req.body.login_required
  const hasLoginChange = loginRequired !== undefined
  const hasAdditionalEmailsChange = req.body.additional_emails !== undefined
  const hasDepartmentHeadChange = req.body.is_department_head !== undefined

  if (!Object.keys(updates).length && !hasLoginChange && !hasAdditionalEmailsChange && !hasDepartmentHeadChange) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  if (loginRequired && !(updates.email ?? current.email)?.trim()) {
    return res.status(400).json({ error: 'Email is required when login is enabled' })
  }

  if (updates.is_active === true) {
    try {
      await assertUnderLimitIfReactivating(
        orgId,
        'employee',
        current.is_active,
        true,
      )
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
  }

  if (hasLoginChange && loginRequired && !current.login_required) {
    try {
      await assertLoginSlotAvailable(orgId, { email: (updates.email ?? current.email)?.trim() })
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
  }

  if (updates.email !== undefined && updates.email?.trim()) {
    const nextPrimary = updates.email.trim().toLowerCase()
    const { data: emailConflicts, error: emailConflictError } = await supabaseAdmin
      .from('org_employee_emails')
      .select('employee_id')
      .eq('org_id', orgId)
      .ilike('email', nextPrimary)
      .neq('employee_id', req.params.id)
      .limit(1)

    if (emailConflictError) return res.status(500).json({ error: emailConflictError.message })
    if (emailConflicts?.length) {
      return res.status(400).json({ error: 'This email is already assigned to another employee' })
    }
  }

  if (updates.photo_url !== undefined) {
    const path = updates.photo_url
    if (path === '' || path === null) {
      updates.photo_url = null
    } else if (!isValidEmployeePhotoPath(path, orgId)) {
      return res.status(400).json({ error: 'Invalid photo path' })
    }
  }

  if (updates.manager_id === '') {
    updates.manager_id = null
  }

  if (updates.access_role_id === '') {
    updates.access_role_id = null
  }

  if (updates.mobile !== undefined) {
    const mobileError = validatePhoneE164(updates.mobile)
    if (mobileError) return res.status(400).json({ error: mobileError })
    updates.mobile = normalizePhoneE164(updates.mobile)
  }

  try {
    await validateEmployeeRefs(orgId, {
      designation_id: updates.designation_id,
      department_id: updates.department_id,
      location_id: updates.location_id,
      manager_id: updates.manager_id,
      access_role_id: updates.access_role_id,
      employee_id: req.params.id,
    }, req.userProfile)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (hasAdditionalEmailsChange) {
    try {
      const nextPrimary = (updates.email ?? current.email)?.trim()
      await validateAdditionalEmails(orgId, req.params.id, nextPrimary, req.body.additional_emails)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
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
    if (hasAdditionalEmailsChange) {
      await syncEmployeeEmails(orgId, req.params.id, req.body.additional_emails)
    }

    let loginEmailSent = false
    const nextEmail = (updates.email ?? current.email)?.trim()
    const nextName = (updates.name ?? current.name)?.trim()
    const nextLoginRequired = hasLoginChange
      ? Boolean(loginRequired)
      : Boolean(current.login_required)

    const emailChanged = updates.email !== undefined
      && updates.email?.trim().toLowerCase() !== current.email?.trim().toLowerCase()

    const isReactivating = updates.is_active === true && current.is_active === false

    if (hasLoginChange) {
      const loginResult = await handleEmployeeLoginAccess(orgId, req.params.id, {
        loginRequired: nextLoginRequired,
        email: nextEmail,
        employeeName: nextName,
        wasLoginRequired: Boolean(current.login_required),
        emailChanged,
        // Disable → enable must always send a fresh password setup email.
        forceEmail: Boolean(nextLoginRequired) && !current.login_required,
      })
      loginEmailSent = Boolean(loginResult?.emailSent)
    } else if (isReactivating && nextLoginRequired && nextEmail) {
      // Active toggle off → on: resend login email when login is still required.
      const loginResult = await handleEmployeeLoginAccess(orgId, req.params.id, {
        loginRequired: true,
        email: nextEmail,
        employeeName: nextName,
        wasLoginRequired: true,
        emailChanged: false,
        forceEmail: true,
      })
      loginEmailSent = Boolean(loginResult?.emailSent)
    }

    if (hasDepartmentHeadChange) {
      const nextDepartmentId = updates.department_id ?? current.department_id ?? null
      await syncEmployeeDepartmentHead(
        orgId,
        req.params.id,
        nextDepartmentId,
        Boolean(req.body.is_department_head),
      )
    }

    const withPhoto = await getEmployeeById(orgId, req.params.id)
    res.json({
      ...withPhoto,
      ...((hasLoginChange && nextLoginRequired) || (isReactivating && loginEmailSent)
        ? { login_email_sent: loginEmailSent }
        : {}),
    })
  } catch (loginError) {
    res.status(400).json({ error: loginError.message })
  }
})

router.delete('/employees/:id', canDeleteEmployees, assertOrgOwnership('org_employees'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('org_employees')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('org_id', req.userProfile.org_id)
    .select(EMPLOYEE_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const withPhoto = await attachEmployeePhotoUrl(data)
  const decorated = await attachEmployeeHeadMeta(req.userProfile.org_id, withPhoto)
  res.json(decorated)
})

export default router
