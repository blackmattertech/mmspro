import crypto from 'crypto'
import { buildAppRecoveryUrl, getPasswordResetRedirectUrl } from '../lib/appUrl.js'
import { supabaseAdmin } from '../services/supabase.js'
import { ACCOUNT_ROLES } from './accountRoles.js'
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
  const redirectTo = getPasswordResetRedirectUrl()

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    console.warn('Could not generate password link:', error.message)
    return false
  }

  const resetUrl = buildAppRecoveryUrl(data)
  if (!resetUrl) {
    console.warn('Could not generate password link: missing recovery URL')
    return false
  }

  if (!(await isEmailConfigured())) {
    console.log(`\n[Owner password setup link — Mailjet not configured]\n  ${email}\n  ${resetUrl}\n`)
    return false
  }

  const result = await sendOwnerPasswordSetupEmail(email, { resetUrl, orgName })
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

function fail(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

/**
 * Picks the org company-admin whose login should follow organizations.email.
 * Prefer the admin that still matches the current org email; otherwise the oldest admin.
 */
async function findOrgOwnerProfile(orgId, currentOrgEmail) {
  const { data: admins, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, created_at')
    .eq('org_id', orgId)
    .eq('role', ACCOUNT_ROLES.ADMIN)
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!admins?.length) return null

  const current = String(currentOrgEmail || '').trim().toLowerCase()
  if (current) {
    const match = admins.find((row) => String(row.email || '').toLowerCase() === current)
    if (match) return match
  }

  return admins[0]
}

/**
 * Updates the org owner's login email (auth.users + profiles) to match organizations.email.
 * Sends a password-setup email to the new address when the login email changes.
 *
 * Returns { changed, emailSent, ownerEmail, previousEmail } or null when there is no owner to sync.
 */
export async function syncOrgOwnerLoginEmail(orgId, {
  previousOrgEmail,
  nextEmail,
  orgName,
} = {}) {
  const normalizedNext = String(nextEmail || '').trim().toLowerCase()
  if (!normalizedNext) {
    throw fail(400, 'Organization email is required to update the owner login')
  }

  const owner = await findOrgOwnerProfile(orgId, previousOrgEmail)
  if (!owner) return null

  const previousLoginEmail = String(owner.email || '').toLowerCase()
  if (previousLoginEmail === normalizedNext) {
    return {
      changed: false,
      emailSent: false,
      ownerEmail: normalizedNext,
      previousEmail: previousLoginEmail,
    }
  }

  const { data: conflict, error: conflictError } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id')
    .ilike('email', normalizedNext)
    .neq('id', owner.id)
    .maybeSingle()
  if (conflictError) throw conflictError
  if (conflict) {
    throw fail(409, 'That email already belongs to another account')
  }

  const authConflict = await getAuthUserByEmail(normalizedNext)
  if (authConflict && authConflict.id !== owner.id) {
    throw fail(409, 'That email already belongs to another account')
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(owner.id, {
    email: normalizedNext,
    email_confirm: true,
  })
  if (authError) {
    if (isEmailExistsError(authError)) {
      throw fail(409, 'That email already belongs to another account')
    }
    throw authError
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ email: normalizedNext })
    .eq('id', owner.id)
  if (profileError) throw profileError

  if (previousLoginEmail) {
    await supabaseAdmin
      .from('org_invites')
      .update({ email: normalizedNext })
      .eq('org_id', orgId)
      .ilike('email', previousLoginEmail)
  }

  let emailSent = false
  try {
    emailSent = await sendOwnerAccessEmail(normalizedNext, {
      orgName: orgName || undefined,
    })
  } catch (emailErr) {
    console.warn('Owner access email after login change failed:', emailErr.message)
  }

  return {
    changed: true,
    emailSent,
    ownerEmail: normalizedNext,
    previousEmail: previousLoginEmail || null,
  }
}
