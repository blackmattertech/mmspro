import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions } from '../../middleware/modulePermission.js'
import {
  getTableColumnDefault,
  upsertTableColumnDefault,
} from '../../lib/tableColumnDefaults.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

function sendError(res, err) {
  const status = err.status || 500
  res.status(status).json({ error: err.message })
}

function requireOrgAdmin(req, res, next) {
  if (req.orgPermissions?.is_org_admin) return next()
  return res.status(403).json({ error: 'Only organization admins can set default columns' })
}

router.get('/:tableId', async (req, res) => {
  try {
    const row = await getTableColumnDefault(req.userProfile.org_id, req.params.tableId)
    res.json(row || { table_id: req.params.tableId, prefs: null, version: 0 })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/:tableId', requireOrgAdmin, async (req, res) => {
  try {
    const row = await upsertTableColumnDefault(
      req.userProfile.org_id,
      req.params.tableId,
      req.body?.prefs || req.body,
      req.userProfile.id,
    )
    res.json(row)
  } catch (err) {
    sendError(res, err)
  }
})

export default router
