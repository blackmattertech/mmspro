import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { supabaseAdmin } from '../../services/supabase.js'
import {
  sendWelcomeEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
} from '../../services/email.js'
import { createOrgForUser } from '../../lib/createOrg.js'
import { getPublicAppUrl } from '../../lib/appUrl.js'
import { assertLoginSlotAvailable } from '../../lib/orgLimits.js'

const router = Router()

/**
 * POST /api/auth/invite
 * Org owner/admin invites a team member
 */
router.post('/invite', verifyAuth, requireOrgAccess, async (req, res) => {
  const { email, role = 'member' } = req.body
  const { org_id, role: inviterRole } = req.userProfile

  if (!['owner', 'admin'].includes(inviterRole)) {
    return res.status(403).json({ error: 'Only owners and admins can invite' })
  }

  // Get org name
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('name')
    .eq('id', org_id)
    .single()

  // Create invite record
  const { data: invite, error } = await supabaseAdmin
    .from('org_invites')
    .insert({ org_id, email, role })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Send invite email
  await sendInviteEmail(email, {
    inviterName: req.userProfile.email,
    orgName: org.name,
    inviteToken: invite.token,
  })

  res.json({ success: true })
})

/**
 * POST /api/auth/invite/accept
 * User accepts an invite and gets linked to the org
 */
router.post('/invite/accept', verifyAuth, async (req, res) => {
  const { token } = req.body

  const { data: invite, error } = await supabaseAdmin
    .from('org_invites')
    .select('*')
    .eq('token', token)
    .is('accepted_at', null)
    .single()

  if (error || !invite) return res.status(400).json({ error: 'Invalid or expired invite' })

  try {
    await assertLoginSlotAvailable(invite.org_id, { email: req.user.email })
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message })
  }

  // Link user to org
  await supabaseAdmin
    .from('profiles')
    .update({ org_id: invite.org_id, role: invite.role })
    .eq('id', req.user.id)

  // Mark invite as accepted
  await supabaseAdmin
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  res.json({ success: true })
})

const PASSWORD_RESET_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.'

/**
 * POST /api/auth/password-reset
 * Trigger Supabase password reset + send branded email
 */
router.post('/password-reset', async (req, res) => {
  const email = req.body?.email?.trim().toLowerCase()

  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const redirectTo = `${getPublicAppUrl()}/reset-password`

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    console.warn('password-reset:', error.message)
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE })
  }

  await sendPasswordResetEmail(email, { resetUrl: data.properties.action_link })

  res.json({ success: true, message: PASSWORD_RESET_MESSAGE })
})

/**
 * POST /api/auth/onboard
 * After signup: create org + send welcome email
 */
router.post('/onboard', verifyAuth, async (req, res) => {
  const { orgName } = req.body

  if (!orgName?.trim()) {
    return res.status(400).json({ error: 'Company name is required' })
  }

  try {
    const { orgId, orgSlug } = await createOrgForUser(
      req.user.id,
      req.user.email,
      orgName,
      req.body.orgSlug
    )

    try {
      await sendWelcomeEmail(req.user.email, {
        name: req.user.email.split('@')[0],
        orgName: orgName.trim(),
        orgSlug,
      })
    } catch (emailErr) {
      console.warn('Welcome email skipped:', emailErr.message)
    }

    res.json({ org_id: orgId, slug: orgSlug })
  } catch (err) {
    console.error('onboard error:', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
