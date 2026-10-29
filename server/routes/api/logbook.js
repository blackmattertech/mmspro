import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import {
  requireModulePermission,
  requireAnyModulePermission,
  loadOrgPermissions,
} from '../../middleware/modulePermission.js'
import { assertLocationAccess, resolveLocationFilter } from '../../lib/orgPermissions.js'
import {
  addMeterReading,
  deleteMeterReading,
  getLatestMeterReading,
  listLogbookEquipment,
  listMeterReadings,
} from '../../lib/logbookService.js'

const router = Router()

const canRead = requireModulePermission('logbook', 'read')
const canCreate = requireModulePermission('logbook', 'create')
const canDelete = requireModulePermission('logbook', 'delete')
const canReadLatest = requireAnyModulePermission([
  ['logbook', 'read'],
  ['work_orders_scheduled', 'read'],
])

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
    const locationId = resolveLocationFilter(req.orgPermissions, req.query.location_id)
    const page = await listLogbookEquipment(req.userProfile.org_id, {
      locationId,
      search: req.query.search || null,
      limit,
      offset,
    })
    res.json(page)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/latest', canReadLatest, async (req, res) => {
  try {
    const equipmentId = String(req.query.equipment_id || '').trim()
    if (!equipmentId) return res.status(400).json({ error: 'Asset is required' })
    const latest = await getLatestMeterReading(req.userProfile.org_id, equipmentId)
    assertLocationAccess(req.orgPermissions, latest.location_id)
    res.json(latest)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:equipmentId/readings', canRead, async (req, res) => {
  try {
    const payload = await listMeterReadings(req.userProfile.org_id, req.params.equipmentId)
    assertLocationAccess(req.orgPermissions, payload.equipment.location_id)
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:equipmentId/readings', canCreate, async (req, res) => {
  try {
    const latest = await getLatestMeterReading(req.userProfile.org_id, req.params.equipmentId)
    assertLocationAccess(req.orgPermissions, latest.location_id)
    const saved = await addMeterReading(
      req.userProfile.org_id,
      req.params.equipmentId,
      req.body,
      req.userProfile.id,
    )
    res.status(201).json(saved)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.delete('/readings/:readingId', canDelete, async (req, res) => {
  try {
    const result = await deleteMeterReading(
      req.userProfile.org_id,
      req.params.readingId,
      {
        assertEquipment: (equipment) => assertLocationAccess(req.orgPermissions, equipment.location_id),
      },
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
