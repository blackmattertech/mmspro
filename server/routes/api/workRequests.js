import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import {
  getWorkRequestFormContext,
  createWorkRequest,
  listWorkRequests,
  getWorkRequestById,
  approveWorkRequest,
  rejectWorkRequest,
  requestMoreInfo,
  listEquipmentForDepartment,
  listEquipmentCatalogForDepartment,
  getEmployeeByProfile,
} from '../../lib/workRequestService.js'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

const canReadCreate = requireModulePermission('work_request_create', 'read')
const canCreate = requireModulePermission('work_request_create', 'create')
const canReadMy = requireModulePermission('work_request_my', 'read')
const canReadIncoming = requireModulePermission('work_request_incoming', 'read')
const canUpdateIncoming = requireModulePermission('work_request_incoming', 'update')
const canReadOutgoing = requireModulePermission('work_request_outgoing', 'read')
const canReadAll = requireModulePermission('work_request_all', 'read')
const canReadAny = requireAnyModulePermission([
  ['work_request_create', 'read'],
  ['work_request_my', 'read'],
  ['work_request_incoming', 'read'],
  ['work_request_outgoing', 'read'],
  ['work_request_all', 'read'],
])

function sendError(res, err) {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
}

function canCreateWorkRequestWithoutEmployeeDepartment(orgPermissions) {
  if (!orgPermissions) return false
  if (orgPermissions.is_org_admin) return true
  const roleName = orgPermissions.access_role?.name?.trim().toLowerCase() || ''
  return roleName === 'admin'
}

router.get('/form', canReadCreate, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const ctx = await getWorkRequestFormContext(
      orgId,
      req.userProfile.id,
      req.userProfile.email,
      { isOrgAdmin: canCreateWorkRequestWithoutEmployeeDepartment(req.orgPermissions) },
    )
    res.json(ctx)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/equipment-catalog', canReadCreate, async (req, res) => {
  const orgId = req.userProfile.org_id
  const departmentId = req.query.department_id
  if (!departmentId) {
    return res.status(400).json({ error: 'department_id is required' })
  }
  try {
    const catalog = await listEquipmentCatalogForDepartment(orgId, departmentId)
    res.json(catalog)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/equipment', canReadCreate, async (req, res) => {
  const orgId = req.userProfile.org_id
  const departmentId = req.query.department_id
  if (!departmentId) {
    return res.status(400).json({ error: 'department_id is required' })
  }
  try {
    const rows = await listEquipmentForDepartment(orgId, departmentId, {
      search: req.query.search || null,
    })
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/', canCreate, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const row = await createWorkRequest(
      orgId,
      req.userProfile.id,
      req.userProfile.email,
      req.body,
      { isOrgAdmin: canCreateWorkRequestWithoutEmployeeDepartment(req.orgPermissions) },
    )
    res.status(201).json(row)
  } catch (err) {
    sendError(res, err)
  }
})

const FILTER_PERMISSION = {
  my: canReadMy,
  incoming: canReadIncoming,
  outgoing: canReadOutgoing,
  all: canReadAll,
}

router.get('/', async (req, res, next) => {
  const filter = req.query.filter || 'all'
  const guard = FILTER_PERMISSION[filter]
  if (!guard) return res.status(400).json({ error: 'Invalid filter' })
  return guard(req, res, next)
}, async (req, res) => {
  const orgId = req.userProfile.org_id
  const filter = req.query.filter || 'all'
  try {
    const employee = await getEmployeeByProfile(orgId, req.userProfile.id, {
      email: req.userProfile.email,
    })
    const rows = await listWorkRequests(orgId, filter, {
      profileId: req.userProfile.id,
      departmentId: employee?.department_id || null,
    })
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id/department-employees', canReadIncoming, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const wr = await getWorkRequestById(orgId, req.params.id)
    if (!wr) return res.status(404).json({ error: 'Work request not found' })

    const { data, error } = await supabaseAdmin
      .from('org_employees')
      .select('id, name, emp_id, email, department_id, location_id')
      .eq('org_id', orgId)
      .eq('department_id', wr.order_to_department_id)
      .eq('is_active', true)
      .order('name')

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id', canReadAny, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const row = await getWorkRequestById(orgId, req.params.id)
    if (!row) return res.status(404).json({ error: 'Work request not found' })
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:id/approve', canUpdateIncoming, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const result = await approveWorkRequest(
      orgId,
      req.userProfile.id,
      req.params.id,
      req.body,
    )
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:id/reject', canUpdateIncoming, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const result = await rejectWorkRequest(
      orgId,
      req.userProfile.id,
      req.params.id,
      req.body?.reason,
    )
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:id/need-info', canUpdateIncoming, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    const result = await requestMoreInfo(
      orgId,
      req.userProfile.id,
      req.params.id,
      req.body?.message,
    )
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

export default router
