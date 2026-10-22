import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import {
  resolveLocationFilter,
  assertLocationAccess,
  coerceScopedLocationId,
} from '../../lib/orgPermissions.js'
import {
  listEquipment,
  getEquipmentDetail,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  findEquipmentByScan,
} from '../../lib/equipmentService.js'
import {
  buildEquipmentTemplate,
  bulkImportEquipment,
} from '../../lib/equipmentBulkService.js'
import { attachFailedFileToResult } from '../../lib/importErrorWorkbook.js'
import { parseListControls } from '../../lib/listQuery.js'
import { listEquipmentPickerCatalog } from '../../lib/workRequestService.js'

const router = Router()

const canRead = requireModulePermission('equipment', 'read')
const canReadPicker = requireAnyModulePermission([
  ['equipment', 'read'],
  ['work_orders_scheduled', 'read'],
  ['work_orders', 'read'],
])
const canCreate = requireModulePermission('equipment', 'create')
const canUpdate = requireModulePermission('equipment', 'update')
const canDelete = requireModulePermission('equipment', 'delete')

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function parsePagination(query) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

router.get('/catalog', canReadPicker, async (req, res) => {
  try {
    const locationId = resolveLocationFilter(req.orgPermissions, req.query.location_id)
    const catalog = await listEquipmentPickerCatalog(req.userProfile.org_id, {
      departmentId: req.query.department_id || null,
      locationId,
      search: req.query.search || null,
      limit: Number(req.query.limit) || 200,
    })
    res.json(catalog)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/', canRead, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query)
    const locationId = resolveLocationFilter(req.orgPermissions, req.query.location_id)
    const controls = parseListControls(req.query)
    const rows = await listEquipment(req.userProfile.org_id, {
      locationId,
      departmentId: req.query.department_id || null,
      areaId: req.query.area_id || null,
      search: req.query.search || null,
      filters: controls.filters,
      sortBy: req.query.sort_by || 'name_asc',
      limit,
      offset,
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/template', canCreate, async (req, res) => {
  try {
    const buffer = await buildEquipmentTemplate(req.userProfile.org_id, {
      locationId: resolveLocationFilter(req.orgPermissions, null),
    })
    res.json({
      filename: 'equipment-template.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer.toString('base64'),
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/bulk', canCreate, async (req, res) => {
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
    const result = await bulkImportEquipment(req.userProfile.org_id, buffer, { locationId })
    const payload = await attachFailedFileToResult(result, buffer, 'equipment-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/lookup', canRead, async (req, res) => {
  try {
    const row = await findEquipmentByScan(req.userProfile.org_id, req.query.code)
    if (!row) {
      return res.status(404).json({ error: 'This code is not an equipment record in your organization.' })
    }
    assertLocationAccess(req.orgPermissions, row.location_id)
    const detail = await getEquipmentDetail(req.userProfile.org_id, row.id)
    res.json(detail)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:id', canRead, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const row = await getEquipmentDetail(req.userProfile.org_id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Equipment not found' })
    assertLocationAccess(req.orgPermissions, row.location_id)
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/', canCreate, async (req, res) => {
  try {
    const location_id = coerceScopedLocationId(req.orgPermissions, req.body?.location_id)
    const row = await createEquipment(req.userProfile.org_id, { ...req.body, location_id })
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const existing = await getEquipmentDetail(req.userProfile.org_id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Equipment not found' })
    assertLocationAccess(req.orgPermissions, existing.location_id)
    const location_id = req.body?.location_id !== undefined
      ? coerceScopedLocationId(req.orgPermissions, req.body.location_id)
      : undefined
    const row = await updateEquipment(
      req.userProfile.org_id,
      req.params.id,
      location_id !== undefined ? { ...req.body, location_id } : req.body,
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', canDelete, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const existing = await getEquipmentDetail(req.userProfile.org_id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Equipment not found' })
    assertLocationAccess(req.orgPermissions, existing.location_id)
    const result = await deleteEquipment(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
