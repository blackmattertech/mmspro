import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { isCompanyAdmin } from '../../lib/accountRoles.js'
import {
  getImportJobForUser,
  listImportJobs,
  getImportJobFailedFile,
  toPublicImportJob,
  toClientImportResult,
  isTerminalImportStatus,
} from '../../lib/importJobService.js'

const router = Router()

router.use(verifyAuth, requireOrgAccess)

function isAdmin(req) {
  return isCompanyAdmin(req.userProfile?.role)
}

router.get('/', async (req, res) => {
  try {
    const jobs = await listImportJobs(
      req.userProfile.org_id,
      req.userProfile.id,
      { isOrgAdmin: isAdmin(req), limit: Number(req.query.limit) || 30 },
    )
    res.json({ jobs })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const row = await getImportJobForUser(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      { isOrgAdmin: isAdmin(req) },
    )
    const job = toPublicImportJob(row)
    const payload = { job }
    if (isTerminalImportStatus(row.status) && row.status === 'completed') {
      payload.result = toClientImportResult(row)
    }
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.get('/:id/failed-file', async (req, res) => {
  try {
    const file = await getImportJobFailedFile(
      req.userProfile.org_id,
      req.params.id,
      req.userProfile.id,
      { isOrgAdmin: isAdmin(req) },
    )
    res.json({
      filename: file.filename,
      contentType: file.contentType,
      data: file.data,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
