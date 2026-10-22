import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions } from '../../middleware/modulePermission.js'
import { buildRecordPdf, sendRecordPdf } from '../../lib/recordPdf.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

router.get('/:module/:id/pdf', async (req, res) => {
  try {
    const document = await buildRecordPdf(req.userProfile.org_id, req.params.module, req.params.id)
    sendRecordPdf(res, document)
  } catch (err) {
    if (res.headersSent) return
    res.status(err.status || 500).json({ error: err.message || 'Could not build PDF' })
  }
})

export default router
