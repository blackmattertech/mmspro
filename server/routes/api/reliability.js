import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { assertLocationAccess, resolveLocationFilter } from '../../lib/orgPermissions.js'
import { excelFilePayload } from '../../lib/excelTemplate.js'
import {
  buildReliabilityExcelExport,
  buildReliabilityReport,
  createManualRunningHours,
  deleteManualRunningHours,
  listManualRunningHours,
  updateManualRunningHours,
} from '../../lib/reliabilityService.js'

const router = Router()

const canRead = requireModulePermission('equipment', 'read')
const canUpdate = requireModulePermission('equipment', 'update')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function reportFiltersFromQuery(req) {
  const locationId = resolveLocationFilter(req.orgPermissions, req.query.location_id)
  if (locationId) assertLocationAccess(req.orgPermissions, locationId)
  return {
    locationId,
    departmentId: req.query.department_id || null,
    equipmentId: req.query.equipment_id || null,
    dateFrom: req.query.date_from,
    dateTo: req.query.date_to,
    evaluationHours: req.query.evaluation_hours,
    nameFieldId: req.query.name_field_id || null,
  }
}

router.get('/report', canRead, async (req, res) => {
  try {
    const report = await buildReliabilityReport(req.userProfile.org_id, reportFiltersFromQuery(req))
    res.json(report)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/report/excel', canRead, async (req, res) => {
  try {
    const { filename, buffer } = await buildReliabilityExcelExport(
      req.userProfile.org_id,
      reportFiltersFromQuery(req),
    )
    res.json(excelFilePayload(filename, buffer))
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/manual-hours', canRead, async (req, res) => {
  try {
    const locationId = resolveLocationFilter(req.orgPermissions, req.query.location_id)
    if (locationId) assertLocationAccess(req.orgPermissions, locationId)
    const limit = Number(req.query.limit)
    const offset = Number(req.query.offset)
    const page = await listManualRunningHours(req.userProfile.org_id, {
      equipmentId: req.query.equipment_id || null,
      locationId,
      dateFrom: req.query.date_from || null,
      dateTo: req.query.date_to || null,
      limit: Number.isFinite(limit) ? limit : 200,
      offset: Number.isFinite(offset) ? offset : 0,
    })
    res.json(page)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/manual-hours', canUpdate, async (req, res) => {
  try {
    const row = await createManualRunningHours(
      req.userProfile.org_id,
      req.userProfile.id,
      req.body || {},
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.patch('/manual-hours/:id', canUpdate, async (req, res) => {
  try {
    const row = await updateManualRunningHours(
      req.userProfile.org_id,
      req.params.id,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.delete('/manual-hours/:id', canUpdate, async (req, res) => {
  try {
    const row = await deleteManualRunningHours(req.userProfile.org_id, req.params.id)
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
