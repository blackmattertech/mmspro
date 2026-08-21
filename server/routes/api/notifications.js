import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { notifyUser, notifyOrg, isFirebaseAdminConfigured } from '../../services/notifications.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { enrichNotificationUrls } from '../../lib/notificationInboxUrl.js'

const router = Router()
router.use(verifyAuth, requireOrgAccess)

function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body || '',
    url: row.url || '/',
    data: row.data || {},
    time: row.created_at,
    read: Boolean(row.read_at),
  }
}

function isMissingInboxTable(error) {
  const message = error?.message || ''
  return error?.code === 'PGRST205' || error?.code === '42P01' || message.includes('user_notifications')
}

router.get('/', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('user_notifications')
      .select('id, title, body, url, data, read_at, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (req.userProfile?.org_id) {
      query = query.eq('org_id', req.userProfile.org_id)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingInboxTable(error)) {
        return res.json({
          items: [],
          unread: 0,
          push_configured: isFirebaseAdminConfigured,
          inbox_ready: false,
        })
      }
      throw error
    }
    let items = (data || []).map(mapNotification)
    try {
      const enriched = await enrichNotificationUrls(
        req.user.id,
        req.userProfile?.org_id,
        null,
        data || [],
      )
      items = enriched.map(mapNotification)
    } catch (err) {
      console.warn('Failed to rewrite notification URLs:', err.message)
    }
    res.json({
      items,
      unread: items.filter((item) => !item.read).length,
      push_configured: isFirebaseAdminConfigured,
      inbox_ready: true,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/read-all', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .is('read_at', null)
    if (error) {
      if (isMissingInboxTable(error)) return res.json({ success: true, inbox_ready: false })
      throw error
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id/read', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
    if (error) {
      if (isMissingInboxTable(error)) return res.json({ success: true, inbox_ready: false })
      throw error
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/token', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Token required' })

  try {
    const { error } = await supabaseAdmin.from('fcm_tokens').upsert({
      user_id: req.user.id,
      token,
    }, { onConflict: 'token' })
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/send/user/:userId', async (req, res) => {
  const { title, body, url } = req.body
  if (req.params.userId !== req.user.id && req.userProfile.role !== 'super_admin' && req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    await notifyUser(req.params.userId, { title, body, url })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/send/org', async (req, res) => {
  const { title, body, url } = req.body
  if (req.userProfile.role !== 'super_admin' && req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    await notifyOrg(req.userProfile.org_id, { title, body, url })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
