import crypto from 'crypto'
import { getPublicAppUrl } from '../lib/appUrl.js'
import { supabaseAdmin } from '../services/supabase.js'
import { ensureUserProfile } from './profiles.js'
import { sendOwnerPasswordSetupEmail, isEmailConfigured } from '../services/email.js'

function isEmailExistsError(error) {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  return (
    error.code === 'email_exists' ||
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('already exists')
  )
}

async function getAuthUserByEmail(email) {
  let page = 1
  const perPage = 200

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const user = data.users.find((u) => u.email?.toLowerCase() === email)
    if (user) return user

    if (data.users.length < perPage) break
    page++
  }

  return null
}

/**
 * Sends branded password-setup email via Mailjet using a Supabase recovery link.
 * Returns true if an email was sent.
 */
export async function sendOwnerAccessEmail(email, { orgName }) {
  const redirectTo = `${getPublicAppUrl()}/reset-password`

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    console.warn('Could not generate password link:', error.message)
    return false
  }

  const actionLink = data?.properties?.action_link
  if (!actionLink) {
    console.warn('Could not generate password link: missing action_link')
    return false
  }

  if (!isEmailConfigured) {
    console.log(`\n[Owner password setup link — Mailjet not configured]\n  ${email}\n  ${actionLink}\n`)
    return false
  }

  const result = await sendOwnerPasswordSetupEmail(email, { resetUrl: actionLink, orgName })
  if (!result) {
    console.warn(`Owner access email failed to send via Mailjet → ${email}`)
    return false
  }

  return true
}

/**
 * Creates a new auth user silently (no Supabase email). Password setup is sent separately.
 */
async function createAuthUser(email) {
  const existing = await getAuthUserByEmail(email)
  if (existing) {
    return { user: existing, created: false }
  }

  const password = crypto.randomBytes(32).toString('base64url')
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provisioned_by: 'platform_admin' },
  })

  if (createError) {
    if (isEmailExistsError(createError)) {
      const user = await getAuthUserByEmail(email)
      if (user) return { user, created: false }
    }
    throw createError
  }

  return { user: created.user, created: true }
}

/**
 * Finds an existing user by email or creates a new auth user + profile.
 * Returns { userId, existingOrgId, created }.
 */
export async function findOrCreateOwnerByEmail(email) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Owner email is required')
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, email')
    .ilike('email', normalized)
    .maybeSingle()

  if (profileError) throw profileError

  if (existingProfile) {
    return {
      userId: existingProfile.id,
      existingOrgId: existingProfile.org_id,
      created: false,
    }
  }

  const { user, created } = await createAuthUser(normalized)
  await ensureUserProfile(user.id, normalized)

  return { userId: user.id, existingOrgId: null, created }
}
