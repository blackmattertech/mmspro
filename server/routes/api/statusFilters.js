import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { requireModulePermission } from '../../middleware/modulePermission.js'
import {
  STATUS_FILTER_ENTITY_TYPES,
  getStatusFilterModule,
  listStatusFilterModules,
  replaceStatusPhaseMaps,
  resetStatusPhaseMaps,
} from '../../lib/statusPhaseMapService.js'

const router = Router()
const canUpdate = requireModulePermission('others', 'update')

router.use(verifyAuth, requireOrgAccess)

router.get('/entity-types', (_req, res) => {
  res.json(STATUS_FILTER_ENTITY_TYPES)
})

router.get('/', async (req, res) => {
  try {
    const modules = await listStatusFilterModules(req.userProfile.org_id)
    res.json(modules)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:entityType', async (req, res) => {
  try {
    const module = await getStatusFilterModule(req.userProfile.org_id, req.params.entityType)
    res.json(module)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/:entityType', canUpdate, async (req, res) => {
  try {
    const module = await replaceStatusPhaseMaps(
      req.userProfile.org_id,
      req.params.entityType,
      req.body?.mappings || [],
    )
    res.json(module)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:entityType/reset', canUpdate, async (req, res) => {
  try {
    const module = await resetStatusPhaseMaps(req.userProfile.org_id, req.params.entityType)
    res.json(module)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
