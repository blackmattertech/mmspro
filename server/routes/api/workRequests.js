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
  assertWorkRequestAccessible,
  listWorkRequestTechnicians,
  approveWorkRequest,
  rejectWorkRequest,
  requestMoreInfo,
  replyToWorkRequest,
  listEquipmentForDepartment,
  listEquipmentCatalogForDepartment,
  getEmployeeByProfile,
} from '../../lib/workRequestService.js'
import { getScopedLocationId } from '../../lib/orgPermissions.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

const canReadCreate = requireModulePermission('work_request_create', 'read')
const canCreate = requireModulePermission('work_request_create', 'create')
const canReadMy = requireModulePermission('work_request_my', 'read')
const canReadIncoming = requireModulePermission('work_request_incoming', 'read')
const canApproveWorkRequest = requireAnyModulePermission([
  ['work_request_approve', 'update'],
  ['work_request_incoming', 'update'],
])
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

function scopedLocationId(req) {
  return getScopedLocationId(req.orgPermissions)
}

async function loadAccessibleWorkRequest(req) {
  const row = await getWorkRequestById(req.userProfile.org_id, req.params.id)
  assertWorkRequestAccessible(row, {
    profileId: req.userProfile.id,
    locationId: scopedLocationId(req),
  })
  return row
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
      {
        isOrgAdmin: canCreateWorkRequestWithoutEmployeeDepartment(req.orgPermissions),
        departmentId: req.orgPermissions?.department_id || null,
        locationId: req.orgPermissions?.location_id || null,
      },
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
    const catalog = await listEquipmentCatalogForDepartment(orgId, departmentId, {
      search: req.query.search || null,
      limit: Number(req.query.limit) || 100,
    })
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
      locationId: scopedLocationId(req),
      search: req.query.search || null,
      limit: Math.max(1, Math.min(200, Number(req.query.limit) || 50)),
      offset: Math.max(0, Number(req.query.offset) || 0),
    })
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id/department-employees', canApproveWorkRequest, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    await loadAccessibleWorkRequest(req)
    const rows = await listWorkRequestTechnicians(orgId, req.params.id)
    res.json(rows)
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id', canReadAny, async (req, res) => {
  try {
    const row = await loadAccessibleWorkRequest(req)
    res.json({
      ...row,
      can_reply: row.status === 'need_info' && row.requested_by === req.userProfile.id,
    })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:id/approve', canApproveWorkRequest, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    await loadAccessibleWorkRequest(req)
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

router.post('/:id/reject', canApproveWorkRequest, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    await loadAccessibleWorkRequest(req)
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

router.post('/:id/need-info', canApproveWorkRequest, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    await loadAccessibleWorkRequest(req)
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

router.post('/:id/reply', canReadAny, async (req, res) => {
  const orgId = req.userProfile.org_id
  try {
    await loadAccessibleWorkRequest(req)
    const result = await replyToWorkRequest(
      orgId,
      req.userProfile.id,
      req.params.id,
      req.body,
    )
    res.json({
      ...result,
      can_reply: false,
    })
  } catch (err) {
    sendError(res, err)
  }
})

export default router
