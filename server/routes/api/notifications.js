import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { notifyUser, notifyOrg } from '../../services/notifications.js'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()
router.use(verifyAuth, requireOrgAccess)

// Save FCM token for the current user
router.post('/token', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })

  await supabaseAdmin.from('fcm_tokens').upsert({
    user_id: req.user.id,
    token,
  }, { onConflict: 'token' })

  res.json({ success: true })
})

// Send notification to a user (admin use)
router.post('/send/user/:userId', async (req, res) => {
  const { title, body, url } = req.body
  await notifyUser(req.params.userId, { title, body, url })
  res.json({ success: true })
})

// Send notification to entire org
router.post('/send/org', async (req, res) => {
  const { title, body } = req.body
  await notifyOrg(req.userProfile.org_id, { title, body })
  res.json({ success: true })
})

export default router
