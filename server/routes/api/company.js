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
import { getScopedLocationId, hasModulePermission, resolveLocationFilter, assertLocationAccess, coerceScopedLocationId } from '../../lib/orgPermissions.js'
import { getSignedUrl, getSignedUrls } from '../../lib/signedUrlCache.js'
import { ensureLocationMaintenanceDepartment } from '../../lib/locationDefaults.js'
import { applyIlikeSearch, listEnvelope } from '../../lib/listQuery.js'
import { buildAreasTemplate, bulkImportAreas } from '../../lib/areaBulkService.js'
import {
  buildLocationsTemplate,
  bulkImportLocations,
  buildDepartmentsTemplate,
  bulkImportDepartments,
  buildEmployeesTemplate,
  bulkImportEmployees,
} from '../../lib/companyMasterBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'

const router = Router()

const canReadCompany = requireAnyModulePermission([
  ['company', 'read'],
  ['locations', 'read'],
  ['departments', 'read'],
  ['work_centers', 'read'],
  ['areas', 'read'],
  ['employees', 'read'],
  ['employees', 'create'],
  ['employees', 'update'],
  ['assets', 'read'],
  ['equipment', 'read'],
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

const canReadWorkCenters = requireAnyModulePermission([
  ['work_centers', 'read'],
  ['work_orders', 'read'],
  ['work_orders', 'create'],
  ['work_request_approve', 'update'],
  ['work_request_incoming', 'update'],
])
const canCreateWorkCenters = requireModulePermission('work_centers', 'create')
const canUpdateWorkCenters = requireModulePermission('work_centers', 'update')
const canDeleteWorkCenters = requireModulePermission('work_centers', 'delete')

const canReadAreas = requireAnyModulePermission([
  ['areas', 'read'],
  ['equipment', 'read'],
  ['equipment', 'create'],
  ['employees', 'read'],
])
const canCreateAreas = requireModulePermission('areas', 'create')
const canUpdateAreas = requireModulePermission('areas', 'update')
const canDeleteAreas = requireModulePermission('areas', 'delete')

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

  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, org.logo_url)
  if (signedUrl) {
    return { ...org, logo_signed_url: signedUrl }
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
  id, org_id, name, code, address_line1, address_line2, city, state, postal_code, country,
  is_primary, is_active, head_employee_id, created_at, updated_at,
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

async function attachLocationHeadsFromRoles(orgId, locations) {
  const list = (Array.isArray(locations) ? locations : [locations]).filter(Boolean)
  if (!list.length) return locations

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('org_access_roles')
    .select('id')
    .eq('org_id', orgId)
    .ilike('name', 'location head')

  if (rolesError) throw rolesError

  const roleIds = (roles || []).map((role) => role.id)
  const roleHeadsByLocation = new Map()

  if (roleIds.length) {
    const { data: employees, error: empError } = await supabaseAdmin
      .from('org_employees')
      .select('id, emp_id, name, photo_url, location_id')
      .eq('org_id', orgId)
      .neq('is_active', false)
      .in('access_role_id', roleIds)
      .not('location_id', 'is', null)

    if (empError) throw empError

    for (const employee of employees || []) {
      const existing = roleHeadsByLocation.get(employee.location_id) || []
      existing.push(employee)
      roleHeadsByLocation.set(employee.location_id, existing)
    }
  }

  const enriched = await Promise.all(list.map(async (location) => {
    const withPhoto = await attachLocationHeadPhoto(location)
    const headsById = new Map()

    if (withPhoto.head_employee?.id) {
      headsById.set(withPhoto.head_employee.id, withPhoto.head_employee)
    }

    for (const employee of roleHeadsByLocation.get(location.id) || []) {
      if (!headsById.has(employee.id)) {
        headsById.set(employee.id, employee)
      }
    }

    const location_heads = await Promise.all(
      [...headsById.values()].map((employee) => attachEmployeePhotoUrl(employee)),
    )

    return {
      ...withPhoto,
      location_heads,
    }
  }))

  return Array.isArray(locations) ? enriched : enriched[0]
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
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
  let query = supabaseAdmin
    .from('org_locations')
    .select(LOCATION_SELECT, { count: 'exact' })
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
  query = applyIlikeSearch(query, req.query.search, ['name', 'code', 'city'])

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })
  const withHeads = await attachLocationHeadsFromRoles(req.userProfile.org_id, data || [])
  res.json(listEnvelope(withHeads, { total: count || 0, limit, offset }))
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

  try {
    await ensureLocationMaintenanceDepartment(orgId, data)
  } catch {
    // Location is already created; default department is best-effort.
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

  res.json(await attachLocationHeadsFromRoles(orgId, data))
})

router.delete('/locations/:id', canDeleteLocations, assertOrgOwnership('org_locations'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { count: equipmentCount, error: equipmentError } = await supabaseAdmin
    .from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('location_id', req.params.id)
  if (equipmentError) return res.status(500).json({ error: equipmentError.message })
  if (equipmentCount) {
    return res.status(409).json({
      error: 'This location has equipment. Move or delete that equipment first.',
    })
  }

  const { error } = await supabaseAdmin
    .from('org_locations')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This location is linked to other records and cannot be deleted.',
      })
    }
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, id: req.params.id })
})

// ── Departments ──

const DEPARTMENT_SELECT = `
  id, org_id, name, description, location_id, parent_id, all_locations, is_active, created_at, updated_at,
  org_locations!location_id ( id, name, code )
`

router.get('/departments', canReadDepartments, async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
  let query = supabaseAdmin
    .from('departments')
    .select(DEPARTMENT_SELECT, { count: 'exact' })
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = req.query.location_id || scopedLocationId
  if (locationFilter) {
    query = query.or(`location_id.eq.${locationFilter},all_locations.eq.true`)
  }
  query = applyIlikeSearch(query, req.query.search, ['name'])

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })
  res.json(listEnvelope(data || [], { total: count || 0, limit, offset }))
})

router.post('/departments', canCreateDepartments, async (req, res) => {
  const {
    name, code, description, location_id, parent_id, all_locations,
  } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Name is required' })
  }

  if (!code?.trim()) {
    return res.status(400).json({ error: 'Code is required' })
  }

  const orgId = req.userProfile.org_id
  const appliesToAll = Boolean(all_locations)
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
    })
    .select(DEPARTMENT_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Department code already exists' })
    return res.status(500).json({ error: error.message })
  }

  res.status(201).json(data)
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
    'is_active', 'all_locations',
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

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('departments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select(DEPARTMENT_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Department code already exists' })
    return res.status(500).json({ error: error.message })
  }

  res.json(data)
})

router.delete('/departments/:id', canDeleteDepartments, assertOrgOwnership('departments'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { count: equipmentCount, error: equipmentError } = await supabaseAdmin
    .from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('department_id', req.params.id)
  if (equipmentError) return res.status(500).json({ error: equipmentError.message })
  if (equipmentCount) {
    return res.status(409).json({
      error: 'This department has equipment. Move or delete that equipment first.',
    })
  }

  const { count: requestCount, error: requestError } = await supabaseAdmin
    .from('work_requests')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .or(`order_from_department_id.eq.${req.params.id},order_to_department_id.eq.${req.params.id}`)
  if (requestError) return res.status(500).json({ error: requestError.message })
  if (requestCount) {
    return res.status(409).json({
      error: 'This department is used on work requests and cannot be deleted.',
    })
  }

  const { error } = await supabaseAdmin
    .from('departments')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This department is linked to other records and cannot be deleted.',
      })
    }
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, id: req.params.id })
})

// ── Employees ──

const EMPLOYEE_SELECT = `
  *,
  departments!department_id ( id, name ),
  org_locations!location_id ( id, name, code ),
  org_employee_emails ( id, email ),
  manager:manager_id ( id, emp_id, name ),
  access_role:access_role_id ( id, name )
`

const EMPLOYEE_LIST_SELECT = `
  id, org_id, emp_id, name, email, mobile, is_active, location_id, department_id,
  manager_id, photo_url, access_role_id, login_required, created_at, updated_at,
  departments!department_id ( id, name ),
  org_locations!location_id ( id, name, code ),
  manager:manager_id ( id, emp_id, name, photo_url ),
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

  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, employee.photo_url)
  if (signedUrl) {
    return { ...employee, photo_signed_url: signedUrl }
  }
  return employee
}

/** Merge location-head flags onto employee rows. */
async function attachEmployeeHeadMeta(orgId, employees) {
  const list = (Array.isArray(employees) ? employees : [employees]).filter(Boolean)
  if (!list.length) return employees

  const ids = list.map((employee) => employee.id).filter(Boolean)
  if (!ids.length) return employees

  const { data: headedLocations, error: headedLocationsError } = await supabaseAdmin
    .from('org_locations')
    .select('id, name, code, head_employee_id')
    .eq('org_id', orgId)
    .in('head_employee_id', ids)

  if (headedLocationsError) throw headedLocationsError

  const headedLocationsByEmployee = new Map()
  for (const location of headedLocations || []) {
    const existing = headedLocationsByEmployee.get(location.head_employee_id) || []
    existing.push({ id: location.id, name: location.name, code: location.code })
    headedLocationsByEmployee.set(location.head_employee_id, existing)
  }

  const enriched = list.map((employee) => {
    const locations = headedLocationsByEmployee.get(employee.id) || []
    const accessRoleName = employee.access_role?.name?.trim().toLowerCase() || ''
    return {
      ...employee,
      headed_locations: locations,
      is_location_head: locations.length > 0 || accessRoleName === 'location head',
    }
  })

  return Array.isArray(employees) ? enriched : enriched[0]
}

async function decorateEmployees(orgId, employees) {
  const list = Array.isArray(employees) ? employees : [employees]
  const photoPaths = list.map((employee) => employee?.photo_url).filter(Boolean)
  const signedByPath = photoPaths.length
    ? await getSignedUrls(ORG_ASSETS_BUCKET, photoPaths)
    : new Map()

  const withPhotos = list.map((employee) => {
    if (!employee?.photo_url) return employee
    const signedUrl = signedByPath.get(employee.photo_url) || null
    return signedUrl ? { ...employee, photo_signed_url: signedUrl } : employee
  })

  const enriched = await attachEmployeeHeadMeta(orgId, withPhotos)
  return Array.isArray(employees) ? enriched : enriched[0]
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

async function resolveDefaultUserAccessRoleId(orgId, accessRoleId) {
  if (accessRoleId) return accessRoleId

  const { data, error } = await supabaseAdmin
    .from('org_access_roles')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .ilike('name', 'User')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.id || null
}

async function validateEmployeeRefs(orgId, refs) {
  const { department_id, location_id, manager_id, employee_id, access_role_id } = refs

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

  if (access_role_id) {
    const { data } = await supabaseAdmin
      .from('org_access_roles')
      .select('id')
      .eq('id', access_role_id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!data) throw new Error('Invalid access role')
  }
}

router.get('/employees', canListEmployees, async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
  let query = supabaseAdmin
    .from('org_employees')
    .select(EMPLOYEE_LIST_SELECT, { count: 'exact' })
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  if (req.query.department_id) query = query.eq('department_id', req.query.department_id)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const forAssignment = req.query.for_assignment === '1'
    && hasModulePermission(req.orgPermissions, 'work_orders', 'create')
  if (scopedLocationId && !forAssignment) {
    query = query.eq('location_id', scopedLocationId)
  } else if (req.query.location_id) {
    query = query.eq('location_id', req.query.location_id)
  }
  query = applyIlikeSearch(query, req.query.search, ['name', 'emp_id', 'email', 'mobile'])

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })
  res.json(listEnvelope(data || [], { total: count || 0, limit, offset }))
})

router.post('/employees', canCreateEmployees, async (req, res) => {
  const {
    emp_id, name, mobile, email,
    department_id, location_id, photo_url,
    login_required, additional_emails, manager_id,
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
      department_id, location_id: resolvedLocationId, manager_id, access_role_id,
    })
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  let resolvedAccessRoleId = access_role_id || null
  try {
    resolvedAccessRoleId = await resolveDefaultUserAccessRoleId(orgId, access_role_id || null)
  } catch (err) {
    return res.status(500).json({ error: err.message })
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
      department_id: department_id || null,
      location_id: resolvedLocationId || null,
      manager_id: manager_id || null,
      access_role_id: resolvedAccessRoleId,
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
    'department_id', 'location_id', 'manager_id',
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

  if (!Object.keys(updates).length && !hasLoginChange && !hasAdditionalEmailsChange) {
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
      department_id: updates.department_id,
      location_id: updates.location_id,
      manager_id: updates.manager_id,
      access_role_id: updates.access_role_id,
      employee_id: req.params.id,
    })
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
  const orgId = req.userProfile.org_id
  const { data: current, error: lookupError } = await supabaseAdmin
    .from('org_employees')
    .select('id, photo_url')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (lookupError) return res.status(500).json({ error: lookupError.message })
  if (!current) return res.status(404).json({ error: 'Employee not found' })

  if (current.photo_url) {
    const { error: photoError } = await supabaseAdmin.storage
      .from(ORG_ASSETS_BUCKET)
      .remove([current.photo_url])
    if (photoError) {
      console.warn('Employee photo delete failed:', photoError.message)
    }
  }

  const { error } = await supabaseAdmin
    .from('org_employees')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This employee is linked to other records and cannot be deleted.',
      })
    }
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, id: req.params.id })
})

const AREA_SELECT = `
  id, org_id, location_id, department_id, name, code, is_active, created_at, updated_at,
  org_locations(id, name, code),
  departments(id, name)
`

router.get('/areas', canReadAreas, async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
  let query = supabaseAdmin
    .from('areas')
    .select(AREA_SELECT, { count: 'exact' })
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  const locationFilter = resolveLocationFilter(req.orgPermissions, req.query.location_id)
  if (locationFilter) query = query.eq('location_id', locationFilter)
  if (req.query.department_id) query = query.eq('department_id', req.query.department_id)
  query = applyIlikeSearch(query, req.query.search, ['name', 'code'])

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(listEnvelope(data || [], { total: count || 0, limit, offset }))
})

router.get('/areas/template', canCreateAreas, async (req, res) => {
  try {
    const buffer = await buildAreasTemplate(req.userProfile.org_id, {
      locationId: resolveLocationFilter(req.orgPermissions, null),
    })
    res.json({
      filename: 'areas-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/areas/bulk', canCreateAreas, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      return res.status(400).json({ error: 'File data is invalid' })
    }
    const locationId = resolveLocationFilter(req.orgPermissions, null)
    const result = await bulkImportAreas(req.userProfile.org_id, buffer, { locationId })
    const payload = await attachFailedFileToResult(result, buffer, 'areas-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/locations/template', canCreateLocations, async (req, res) => {
  try {
    const buffer = await buildLocationsTemplate()
    res.json({
      filename: 'locations-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/locations/bulk', canCreateLocations, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      return res.status(400).json({ error: 'File data is invalid' })
    }
    const result = await bulkImportLocations(req.userProfile.org_id, buffer)
    const payload = await attachFailedFileToResult(result, buffer, 'locations-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/departments/template', canCreateDepartments, async (req, res) => {
  try {
    const buffer = await buildDepartmentsTemplate(req.userProfile.org_id)
    res.json({
      filename: 'departments-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/departments/bulk', canCreateDepartments, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      return res.status(400).json({ error: 'File data is invalid' })
    }
    const result = await bulkImportDepartments(req.userProfile.org_id, buffer)
    const payload = await attachFailedFileToResult(result, buffer, 'departments-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/employees/template', canCreateEmployees, async (req, res) => {
  try {
    const buffer = await buildEmployeesTemplate(req.userProfile.org_id)
    res.json({
      filename: 'employees-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/employees/bulk', canCreateEmployees, async (req, res) => {
  try {
    const raw = req.body?.data
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'File data is required' })
    }
    const base64 = raw.includes(',') ? raw.split(',').pop() : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      return res.status(400).json({ error: 'File data is invalid' })
    }
    const result = await bulkImportEmployees(req.userProfile.org_id, buffer)
    const payload = await attachFailedFileToResult(result, buffer, 'employees-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.post('/areas', canCreateAreas, async (req, res) => {
  const { name, code, department_id, is_active } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  let location_id
  try {
    location_id = coerceScopedLocationId(req.orgPermissions, req.body.location_id)
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }
  if (!location_id) return res.status(400).json({ error: 'Location is required' })
  if (!department_id) return res.status(400).json({ error: 'Department is required' })

  const orgId = req.userProfile.org_id

  const { data: loc } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('id', location_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!loc) return res.status(400).json({ error: 'Invalid location' })

  const { data: dept } = await supabaseAdmin
    .from('departments')
    .select('id, location_id, all_locations')
    .eq('id', department_id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!dept) return res.status(400).json({ error: 'Invalid department' })
  if (!dept.all_locations && dept.location_id && dept.location_id !== location_id) {
    return res.status(400).json({ error: 'Department does not belong to the selected location' })
  }

  const normalizedCode = code?.trim() ? code.trim().toUpperCase() : null

  const { data, error } = await supabaseAdmin
    .from('areas')
    .insert({
      org_id: orgId,
      location_id,
      department_id,
      name: name.trim(),
      code: normalizedCode,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
    })
    .select(AREA_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Area code already exists' })
    return res.status(500).json({ error: error.message })
  }
  res.status(201).json(data)
})

router.patch('/areas/:id', canUpdateAreas, assertOrgOwnership('areas'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const { data: current, error: currentError } = await supabaseAdmin
    .from('areas')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (currentError) return res.status(500).json({ error: currentError.message })
  try {
    assertLocationAccess(req.orgPermissions, current.location_id)
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const updates = { updated_at: new Date().toISOString() }
  if (req.body.name !== undefined) {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' })
    updates.name = req.body.name.trim()
  }
  if (req.body.code !== undefined) {
    updates.code = req.body.code?.trim() ? req.body.code.trim().toUpperCase() : null
  }
  if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active)

  let locationId = current.location_id
  if (req.body.location_id !== undefined) {
    try {
      locationId = coerceScopedLocationId(req.orgPermissions, req.body.location_id)
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
  }
  const departmentId = req.body.department_id ?? current.department_id

  if (req.body.location_id !== undefined || req.body.department_id !== undefined) {
    const { data: loc } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('id', locationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!loc) return res.status(400).json({ error: 'Invalid location' })

    const { data: dept } = await supabaseAdmin
      .from('departments')
      .select('id, location_id, all_locations')
      .eq('id', departmentId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!dept) return res.status(400).json({ error: 'Invalid department' })
    if (!dept.all_locations && dept.location_id && dept.location_id !== locationId) {
      return res.status(400).json({ error: 'Department does not belong to the selected location' })
    }

    updates.location_id = locationId
    updates.department_id = departmentId
  }

  const { data, error } = await supabaseAdmin
    .from('areas')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select(AREA_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Area code already exists' })
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

router.delete('/areas/:id', canDeleteAreas, assertOrgOwnership('areas'), async (req, res) => {
  const orgId = req.userProfile.org_id

  const { data: current, error: currentError } = await supabaseAdmin
    .from('areas')
    .select('id, location_id')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (currentError) return res.status(500).json({ error: currentError.message })
  if (!current) return res.status(404).json({ error: 'Area not found' })
  try {
    assertLocationAccess(req.orgPermissions, current.location_id)
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const { count, error: countError } = await supabaseAdmin
    .from('equipment')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('area_id', req.params.id)

  if (countError) return res.status(500).json({ error: countError.message })
  if (count > 0) {
    return res.status(400).json({ error: 'Remove or reassign equipment in this area first' })
  }

  const { error } = await supabaseAdmin
    .from('areas')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This area is linked to other records and cannot be deleted.',
      })
    }
    return res.status(500).json({ error: error.message })
  }
  res.json({ id: req.params.id, deleted: true })
})

const WORK_CENTER_SELECT = `
  id, org_id, location_id, name, code, description, is_active, created_at, updated_at,
  org_locations!location_id ( id, name, code )
`

router.get('/work-centers', canReadWorkCenters, async (req, res) => {
  const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
  let query = supabaseAdmin
    .from('work_centers')
    .select(WORK_CENTER_SELECT, { count: 'exact' })
    .eq('org_id', req.userProfile.org_id)
    .order('name')
    .range(offset, offset + limit - 1)

  const scopedLocationId = getScopedLocationId(req.orgPermissions)
  const locationFilter = req.query.location_id || scopedLocationId
  if (locationFilter) {
    query = query.or(`location_id.eq.${locationFilter},location_id.is.null`)
  }
  query = applyIlikeSearch(query, req.query.search, ['name', 'code', 'description'])

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(listEnvelope(data || [], { total: count || 0, limit, offset }))
})

router.post('/work-centers', canCreateWorkCenters, async (req, res) => {
  const { name, code, description, location_id } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  const orgId = req.userProfile.org_id
  let resolvedLocationId = location_id || null
  try {
    if (resolvedLocationId) {
      resolvedLocationId = coerceScopedLocationId(req.orgPermissions, resolvedLocationId)
    } else {
      const scoped = getScopedLocationId(req.orgPermissions)
      if (scoped) resolvedLocationId = scoped
    }
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  if (resolvedLocationId) {
    const { data: loc } = await supabaseAdmin
      .from('org_locations')
      .select('id')
      .eq('id', resolvedLocationId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!loc) return res.status(400).json({ error: 'Invalid location' })
  }

  const { data, error } = await supabaseAdmin
    .from('work_centers')
    .insert({
      org_id: orgId,
      name: name.trim(),
      code: code?.trim() ? code.trim().toUpperCase() : null,
      description: description?.trim() || null,
      location_id: resolvedLocationId,
    })
    .select(WORK_CENTER_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Work center code already exists' })
    return res.status(500).json({ error: error.message })
  }
  res.status(201).json(data)
})

router.patch('/work-centers/:id', canUpdateWorkCenters, assertOrgOwnership('work_centers'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const { data: current, error: currentError } = await supabaseAdmin
    .from('work_centers')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .single()

  if (currentError) return res.status(500).json({ error: currentError.message })
  if (!current) return res.status(404).json({ error: 'Work center not found' })
  try {
    if (current.location_id) assertLocationAccess(req.orgPermissions, current.location_id)
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const updates = { updated_at: new Date().toISOString() }
  if (req.body.name !== undefined) {
    if (!req.body.name?.trim()) return res.status(400).json({ error: 'Name is required' })
    updates.name = req.body.name.trim()
  }
  if (req.body.code !== undefined) {
    updates.code = req.body.code?.trim() ? String(req.body.code).trim().toUpperCase() : null
  }
  if (req.body.description !== undefined) {
    updates.description = req.body.description?.trim() || null
  }
  if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active)
  if (req.body.location_id !== undefined) {
    try {
      updates.location_id = req.body.location_id
        ? coerceScopedLocationId(req.orgPermissions, req.body.location_id)
        : null
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message })
    }
    if (updates.location_id) {
      const { data: loc } = await supabaseAdmin
        .from('org_locations')
        .select('id')
        .eq('id', updates.location_id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (!loc) return res.status(400).json({ error: 'Invalid location' })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('work_centers')
    .update(updates)
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .select(WORK_CENTER_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Work center code already exists' })
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

router.delete('/work-centers/:id', canDeleteWorkCenters, assertOrgOwnership('work_centers'), async (req, res) => {
  const orgId = req.userProfile.org_id
  const { data: current, error: currentError } = await supabaseAdmin
    .from('work_centers')
    .select('id, location_id')
    .eq('id', req.params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (currentError) return res.status(500).json({ error: currentError.message })
  if (!current) return res.status(404).json({ error: 'Work center not found' })
  try {
    if (current.location_id) assertLocationAccess(req.orgPermissions, current.location_id)
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  const { error } = await supabaseAdmin
    .from('work_centers')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', orgId)

  if (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'This work center is linked to other records and cannot be deleted.',
      })
    }
    return res.status(500).json({ error: error.message })
  }
  res.json({ id: req.params.id, deleted: true })
})

export default router
