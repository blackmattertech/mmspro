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
  countWorkRequestTabs,
  getWorkRequestById,
  loadWorkRequestAssignmentOptions,
  assertWorkRequestAccessible,
  listWorkRequestTechnicians,
  approveWorkRequest,
  rejectWorkRequest,
  requestMoreInfo,
  replyToWorkRequest,
  saveWorkRequestChecklist,
  listEquipmentForDepartment,
  listEquipmentCatalogForDepartment,
  getEmployeeByProfile,
} from '../../lib/workRequestService.js'
import { getScopedLocationId } from '../../lib/orgPermissions.js'
import {
  buildWorkRequestsTemplate,
  bulkImportWorkRequests,
} from '../../lib/workRequestBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'
import { bufferFromBase64Upload, excelFilePayload } from '../../lib/excelTemplate.js'
import { parseListControls, sendCsv } from '../../lib/listQuery.js'
import { withCatalogColumns } from '../../lib/csvExportColumns.js'

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

router.get('/template', canCreate, async (req, res) => {
  try {
    const buffer = await buildWorkRequestsTemplate(req.userProfile.org_id)
    res.json(excelFilePayload('work-requests-template.xlsx', buffer))
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/import', canCreate, async (req, res) => {
  try {
    const buffer = bufferFromBase64Upload(req.body?.data)
    const result = await bulkImportWorkRequests(
      req.userProfile.org_id,
      req.userProfile.id,
      req.userProfile.email,
      buffer,
      { isOrgAdmin: canCreateWorkRequestWithoutEmployeeDepartment(req.orgPermissions) },
    )
    res.json(await attachFailedFileToResult(result, buffer, 'work-requests-import-failed-rows.xlsx'))
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

const WR_CSV_COLUMNS = [
  { id: 'request_number', label: 'WR #', value: (row) => row.request_number || '' },
  { id: 'type', label: 'Type', value: (row) => row.request_type || '' },
  { id: 'order_from', label: 'From', value: (row) => row.order_from?.name || '' },
  { id: 'order_to', label: 'To', value: (row) => row.order_to?.name || '' },
  { id: 'problem', label: 'Short description', value: (row) => row.short_description || '' },
  { id: 'problem_description', label: 'Problem description', value: (row) => row.problem_description || '' },
  { id: 'priority', label: 'Priority', value: (row) => row.priority || '' },
  { id: 'status', label: 'Status', value: (row) => row.status || '' },
  { id: 'execution_status', label: 'Execution status', value: (row) => row.execution_status || '' },
  { id: 'job_nature', label: 'Job nature', value: (row) => row.job_nature || '' },
  { id: 'requester', label: 'Requested by', value: (row) => row.requester?.full_name || row.requester?.name || row.requester?.email || '' },
  { id: 'equipment', label: 'Asset', value: (row) => row.equipment?.name || row.equipment?.code || '' },
  { id: 'remarks', label: 'Remarks', value: (row) => row.remarks || '' },
  { id: 'assigned', label: 'Assigned technicians', value: (row) => (row.assigned_technicians || []).map((tech) => tech.name).join(', ') },
  { id: 'work_order', label: 'Work order', value: (row) => row.linked_work_order?.wo_number || '' },
  { id: 'request_date', label: 'Requested', value: (row) => row.request_date || '' },
  { id: 'created_at', label: 'Created', value: (row) => row.created_at || '' },
  { id: 'updated_at', label: 'Updated', value: (row) => row.updated_at || '' },
]

router.get('/tab-counts', async (req, res) => {
  try {
    const employee = await getEmployeeByProfile(req.userProfile.org_id, req.userProfile.id, {
      email: req.userProfile.email,
    })
    const counts = await countWorkRequestTabs(req.userProfile.org_id, {
      profileId: req.userProfile.id,
      departmentId: employee?.department_id || null,
      locationId: getScopedLocationId(req.orgPermissions),
    })
    res.json(counts)
  } catch (err) {
    sendError(res, err)
  }
})

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
    const controls = parseListControls(req.query)
    let sort = controls.sort
    let sortDir = controls.sortDir
    if (!sort && req.query.sort_by) {
      if (req.query.sort_by === 'oldest') {
        sort = 'request_date'
        sortDir = 'asc'
      } else if (req.query.sort_by === 'priority_high') {
        sort = 'priority'
        sortDir = 'asc'
      } else if (req.query.sort_by === 'priority_low') {
        sort = 'priority'
        sortDir = 'desc'
      } else {
        sort = 'request_date'
        sortDir = 'desc'
      }
    }
    const rows = await listWorkRequests(orgId, filter, {
      profileId: req.userProfile.id,
      departmentId: employee?.department_id || null,
      locationId: scopedLocationId(req),
      search: req.query.search || null,
      limit: controls.exportCsv ? 5000 : Math.max(1, Math.min(200, Number(req.query.limit) || 50)),
      offset: controls.exportCsv ? 0 : Math.max(0, Number(req.query.offset) || 0),
      filters: controls.filters,
      statuses: controls.statuses,
      excludeStatuses: controls.excludeStatuses,
      sort,
      sortDir,
    })
    if (controls.exportCsv) {
      sendCsv(res, 'work-requests.csv', rows.items || [], await withCatalogColumns(orgId, WR_CSV_COLUMNS))
      return
    }
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

router.patch('/:id/checklist', canReadAny, async (req, res) => {
  try {
    await loadAccessibleWorkRequest(req)
    const row = await saveWorkRequestChecklist(
      req.userProfile.org_id,
      req.params.id,
      req.body?.checklist_values || {},
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:id', canReadAny, async (req, res) => {
  try {
    const row = await loadAccessibleWorkRequest(req)
    const assignmentOptions = await loadWorkRequestAssignmentOptions(req.userProfile.org_id)
    res.json({
      ...row,
      can_reply: row.status === 'need_info' && row.requested_by === req.userProfile.id,
      work_center_options: assignmentOptions.work_centers,
      priority_options: assignmentOptions.priorities,
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
