import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { supabaseAdmin } from '../../services/supabase.js'
import { resolveSessionPermissions } from '../../lib/orgPermissions.js'
import { loadMyProfileBundle } from './profile.js'

const router = Router()

const ORG_SELECT = 'id, name, slug, plan, is_active, logo_url'

/**
 * Bootstrap endpoint: org + account role + access permissions in one round-trip.
 * Replaces separate client profile/org fetch + GET /api/roles/me waterfall.
 */
router.get('/session', verifyAuth, requireOrgAccess, async (req, res) => {
  try {
    const [orgResult, permissions, me] = await Promise.all([
      supabaseAdmin
        .from('organizations')
        .select(ORG_SELECT)
        .eq('id', req.userProfile.org_id)
        .single(),
      resolveSessionPermissions(req.userProfile),
      loadMyProfileBundle(req.user.id),
    ])

    if (orgResult.error) {
      console.error('[session] org lookup failed:', orgResult.error.message)
      return res.status(500).json({ error: orgResult.error.message })
    }

    res.json({
      role: req.userProfile.role,
      org: orgResult.data,
      permissions,
      profile: me.profile,
      employee: me.employee,
      avatar_url: me.avatar_url,
    })
  } catch (err) {
    console.error('[session] bootstrap failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
