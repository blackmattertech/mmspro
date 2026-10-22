import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { loadOrgPermissions, requireModulePermission } from '../../middleware/modulePermission.js'
import { listCalendarEvents, CALENDAR_SOURCES } from '../../lib/calendarEvents.js'

const router = Router()
router.use(verifyAuth, requireOrgAccess, loadOrgPermissions)

router.get('/events', requireModulePermission('calendar', 'read'), async (req, res) => {
  try {
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null
    const locationId = req.query.location_id || null
    const sources = req.query.sources
      ? String(req.query.sources).split(',').map((item) => item.trim()).filter(Boolean)
      : null

    const events = await listCalendarEvents({
      orgId: req.userProfile.org_id,
      session: req.orgPermissions,
      userProfile: req.userProfile,
      from,
      to,
      locationId,
      sources,
    })

    res.json({
      events,
      sources: CALENDAR_SOURCES,
      from,
      to,
    })
  } catch (err) {
    console.error('[calendar/events]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
