import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { getScopedLocationId, resolveSessionPermissions } from '../../lib/orgPermissions.js'
import { isMissingDisabledModulesColumn, normalizeDisabledModules } from '../../lib/orgModules.js'
import { findLinkedEmployee, loadMyProfileBundle, loadUserProfile } from './profile.js'
import { loadOrgCatalogFields } from '../../lib/orgFormLayouts.js'
import { listOrgStatusesByEntityTypes } from '../../lib/orgStatusService.js'
import { ORG_STATUS_ENTITY_TYPES } from '../../lib/orgStatusDefaults.js'
import { countWorkRequestTabs, getEmployeeByProfile } from '../../lib/workRequestService.js'
import { countWorkOrderTabs } from './workOrders.js'

const router = Router()

const ORG_SELECT = 'id, name, slug, plan, is_active, logo_url, disabled_modules'
const ORG_SELECT_BASE = 'id, name, slug, plan, is_active, logo_url'

/**
 * Bootstrap endpoint: org + account role + access permissions in one round-trip.
 * Replaces separate client profile/org fetch + GET /api/roles/me waterfall.
 */
router.get('/session', verifyAuth, requireOrgAccess, async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    const [orgResult, profile] = await Promise.all([
      orgId
        ? supabaseAdmin
          .from('organizations')
          .select(ORG_SELECT)
          .eq('id', orgId)
          .single()
        : Promise.resolve({ data: null, error: null }),
      loadUserProfile(req.user.id),
    ])

    let org = orgResult.data
    let orgError = orgResult.error
    if (orgError && isMissingDisabledModulesColumn(orgError) && orgId) {
      const fallback = await supabaseAdmin
        .from('organizations')
        .select(ORG_SELECT_BASE)
        .eq('id', orgId)
        .single()
      org = fallback.data ? { ...fallback.data, disabled_modules: [] } : null
      orgError = fallback.error
    }

    if (orgError) {
      console.error('[session] org lookup failed:', orgError.message)
      return res.status(500).json({ error: orgError.message })
    }

    const disabledModules = normalizeDisabledModules(org?.disabled_modules)
    // One rich employee row for the profile bundle; slim fields feed permissions.
    const employeeRow = orgId ? await findLinkedEmployee(orgId, profile) : null
    const permissionEmployee = employeeRow
      ? {
          id: employeeRow.id,
          location_id: employeeRow.location_id,
          department_id: employeeRow.department_id,
          access_role_id: employeeRow.access_role?.id || null,
          name: employeeRow.name,
          emp_id: employeeRow.emp_id,
        }
      : null

    const [permissions, me] = await Promise.all([
      resolveSessionPermissions(req.userProfile, {
        disabledModules,
        employee: permissionEmployee,
      }),
      loadMyProfileBundle(req.user.id, { profile, employee: employeeRow }),
    ])

    res.json({
      role: req.userProfile.role,
      org,
      permissions,
      profile: me.profile,
      employee: me.employee,
      avatar_url: me.avatar_url,
    })
  } catch (err) {
    console.error('[session] bootstrap failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const BOOTSTRAP_LIMIT = 50

router.get('/bootstrap', verifyAuth, requireOrgAccess, async (req, res) => {
  try {
    const orgId = req.userProfile.org_id
    if (!orgId) {
      return res.json({
        locations: [],
        departments: [],
        work_centers: [],
        catalog_fields: [],
        org_statuses: {},
        tab_counts: {},
      })
    }

    const session = req.orgPermissions || await resolveSessionPermissions(req.userProfile)
    const locationId = getScopedLocationId(session)

    let locationsQuery = supabaseAdmin
      .from('org_locations')
      .select('id, name, code, is_active, is_primary')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('name')
      .limit(BOOTSTRAP_LIMIT)
    if (locationId) locationsQuery = locationsQuery.eq('id', locationId)

    let departmentsQuery = supabaseAdmin
      .from('departments')
      .select('id, name, location_id, all_locations, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name')
      .limit(BOOTSTRAP_LIMIT)
    if (locationId) {
      departmentsQuery = departmentsQuery.or(`location_id.eq.${locationId},all_locations.eq.true`)
    }

    let workCentersQuery = supabaseAdmin
      .from('work_centers')
      .select('id, name, location_id, is_active')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name')
      .limit(BOOTSTRAP_LIMIT)
    if (locationId) workCentersQuery = workCentersQuery.eq('location_id', locationId)

    const statusKeys = ORG_STATUS_ENTITY_TYPES.map((item) => item.key)
    const employeePromise = getEmployeeByProfile(orgId, req.userProfile.id, {
      email: req.userProfile.email,
    }).catch(() => null)

    const [locations, departments, workCenters, catalog, statusesByType, employee] = await Promise.all([
      locationsQuery,
      departmentsQuery,
      workCentersQuery,
      loadOrgCatalogFields(orgId).catch(() => []),
      listOrgStatusesByEntityTypes(orgId, statusKeys, { includeInactive: true }).catch(() => ({})),
      employeePromise,
    ])

    if (locations.error) throw locations.error
    if (departments.error) throw departments.error
    if (workCenters.error) throw workCenters.error

    // Tab counts need employee/session but not locations/catalog — start as soon as
    // employee is known (already resolved above) without waiting on anything else.
    const [wrTabs, woTabs] = await Promise.all([
      countWorkRequestTabs(orgId, {
        profileId: req.userProfile.id,
        departmentId: employee?.department_id || null,
        locationId,
      }).catch(() => ({})),
      countWorkOrderTabs(orgId, req.userProfile, session, { employee }).catch(() => ({})),
    ])

    const catalog_fields = (catalog || [])
      .filter((row) => row.kind === 'parent' && row.is_active !== false)
      .map((row) => ({
        id: row.id,
        name: row.name,
        field_type: row.field_type,
        field_source: row.field_source || 'asset',
      }))

    res.json({
      locations: locations.data || [],
      departments: departments.data || [],
      work_centers: workCenters.data || [],
      catalog_fields,
      org_statuses: statusesByType,
      tab_counts: { work_requests: wrTabs, work_orders: woTabs },
    })
  } catch (err) {
    console.error('[bootstrap] failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
