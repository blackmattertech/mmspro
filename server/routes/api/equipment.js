import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess, assertOrgOwnership } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import {
  listEquipment,
  getEquipmentDetail,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from '../../lib/equipmentService.js'

const router = Router()

const canRead = requireModulePermission('equipment', 'read')
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

router.get('/', canRead, async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query)
    const rows = await listEquipment(req.userProfile.org_id, {
      locationId: req.query.location_id || null,
      departmentId: req.query.department_id || null,
      areaId: req.query.area_id || null,
      search: req.query.search || null,
      limit,
      offset,
    })
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', canRead, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const row = await getEquipmentDetail(req.userProfile.org_id, req.params.id)
    if (!row) return res.status(404).json({ error: 'Equipment not found' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', canCreate, async (req, res) => {
  try {
    const row = await createEquipment(req.userProfile.org_id, req.body)
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.patch('/:id', canUpdate, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const row = await updateEquipment(req.userProfile.org_id, req.params.id, req.body)
    res.json(row)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

router.delete('/:id', canDelete, assertOrgOwnership('equipment'), async (req, res) => {
  try {
    const result = await deleteEquipment(req.userProfile.org_id, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message })
  }
})

export default router
