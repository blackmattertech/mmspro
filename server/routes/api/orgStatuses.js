import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { requireModulePermission } from '../../middleware/modulePermission.js'
import { ORG_STATUS_ENTITY_TYPES } from '../../lib/orgStatusDefaults.js'
import {
  createOrgStatus,
  deleteOrgStatus,
  listOrgStatuses,
  reorderOrgStatuses,
  resetOrgStatuses,
  updateOrgStatus,
} from '../../lib/orgStatusService.js'

const router = Router()
const canCreate = requireModulePermission('others', 'create')
const canUpdate = requireModulePermission('others', 'update')
const canDelete = requireModulePermission('others', 'delete')

router.use(verifyAuth, requireOrgAccess)

router.get('/entity-types', (_req, res) => {
  res.json(ORG_STATUS_ENTITY_TYPES)
})

router.get('/:entityType', async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true'
    const rows = await listOrgStatuses(req.userProfile.org_id, req.params.entityType, { includeInactive })
    res.json(rows)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:entityType', canCreate, async (req, res) => {
  try {
    const row = await createOrgStatus(req.userProfile.org_id, req.params.entityType, req.body || {})
    res.status(201).json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.patch('/:entityType/reorder', canUpdate, async (req, res) => {
  try {
    const rows = await reorderOrgStatuses(
      req.userProfile.org_id,
      req.params.entityType,
      req.body?.ordered_ids || req.body?.ids,
    )
    res.json(rows)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:entityType/reset', canUpdate, async (req, res) => {
  try {
    const rows = await resetOrgStatuses(req.userProfile.org_id, req.params.entityType)
    res.json(rows)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.patch('/:entityType/:id', canUpdate, async (req, res) => {
  try {
    const row = await updateOrgStatus(
      req.userProfile.org_id,
      req.params.entityType,
      req.params.id,
      req.body || {},
    )
    res.json(row)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.delete('/:entityType/:id', canDelete, async (req, res) => {
  try {
    const result = await deleteOrgStatus(req.userProfile.org_id, req.params.entityType, req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
