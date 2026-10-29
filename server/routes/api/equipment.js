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
  listEquipmentColumnValues,
} from '../../lib/equipmentService.js'
import {
  buildEquipmentQrLabels,
  createLabelSize,
  deleteLabelSize,
  listEquipmentIdentityValues,
  listLabelSizes,
  queryEquipmentLabels,
  resolveLabelPaper,
} from '../../lib/equipmentLabelService.js'
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
  ['work_orders', 'create'],
  ['work_orders_manual', 'read'],
  ['work_orders_manual', 'create'],
  ['work_request_create', 'read'],
  ['work_request_create', 'create'],
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

router.get('/column-values', canReadPicker, async (req, res) => {
  try {
    const fieldId = String(req.query.field_id || '').trim()
    if (!fieldId) {
      res.status(400).json({ error: 'field_id is required' })
      return
    }
    const values = await listEquipmentColumnValues(req.userProfile.org_id, fieldId)
    res.json({ values })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

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

router.get('/', canReadPicker, async (req, res) => {
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
      filename: 'assets-template.xlsx',
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
    const payload = await attachFailedFileToResult(result, buffer, 'assets-import-failed-rows.xlsx')
    res.json(payload)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/label-sizes', canRead, async (req, res) => {
  try {
    const payload = await listLabelSizes(req.userProfile.org_id)
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/label-sizes', canUpdate, async (req, res) => {
  try {
    const row = await createLabelSize(req.userProfile.org_id, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/label-sizes/:sizeId', canUpdate, async (req, res) => {
  try {
    const result = await deleteLabelSize(req.userProfile.org_id, req.params.sizeId)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.get('/label-column-values', canRead, async (req, res) => {
  try {
    const locationId = resolveLocationFilter(req.orgPermissions, null)
    const values = await listEquipmentIdentityValues(
      req.userProfile.org_id,
      req.query.column,
      locationId,
    )
    res.json({ values })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/qr-labels/preview', canRead, async (req, res) => {
  try {
    const locationId = resolveLocationFilter(req.orgPermissions, null)
    const { count } = await queryEquipmentLabels(req.userProfile.org_id, {
      scopedLocationId: locationId,
      filters: req.body?.filters || {},
      sort: req.body?.sort || [],
      forPdf: false,
    })
    res.json({ count, cap: 500, over_cap: count > 500 })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/qr-labels', canRead, async (req, res) => {
  try {
    const locationId = resolveLocationFilter(req.orgPermissions, null)
    const paper = await resolveLabelPaper(req.userProfile.org_id, req.body?.paper || {})
    const label = await resolveLabelPaper(req.userProfile.org_id, req.body?.label || {}, {
      fallback: 'label-2x1',
      noun: 'label',
    })
    const { pdf, count } = await buildEquipmentQrLabels(req.userProfile.org_id, {
      scopedLocationId: locationId,
      filters: req.body?.filters || {},
      sort: req.body?.sort || [],
      paper,
      label,
      copies: req.body?.copies,
      print_fields: req.body?.print_fields,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="asset-qr-labels.pdf"')
    res.setHeader('X-Label-Count', String(count))
    res.send(pdf)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/lookup', canRead, async (req, res) => {
  try {
    const row = await findEquipmentByScan(req.userProfile.org_id, req.query.code)
    if (!row) {
      return res.status(404).json({ error: 'This code is not an asset record in your organization.' })
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
    if (!row) return res.status(404).json({ error: 'Asset not found' })
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
    if (!existing) return res.status(404).json({ error: 'Asset not found' })
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
    if (!existing) return res.status(404).json({ error: 'Asset not found' })
    assertLocationAccess(req.orgPermissions, existing.location_id)
    const result = await deleteEquipment(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
