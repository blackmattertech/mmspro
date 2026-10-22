import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions, requireModulePermission } from '../../middleware/modulePermission.js'
import { buildDashboardSummary } from '../../lib/dashboardSummary.js'

const router = Router()
router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

router.get('/summary', requireModulePermission('dashboard', 'read'), async (req, res) => {
  try {
    const locationId = req.query.location_id || null
    const payload = await buildDashboardSummary({
      orgId: req.userProfile.org_id,
      session: req.orgPermissions,
      userProfile: req.userProfile,
      authUserId: req.user?.id,
      locationId,
      dateFrom: req.query.date_from || null,
      dateTo: req.query.date_to || null,
    })
    res.json(payload)
  } catch (err) {
    console.error('[dashboard/summary]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
