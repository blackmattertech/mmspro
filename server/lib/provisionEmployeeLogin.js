import crypto from 'crypto'
import { getPublicAppUrl } from './appUrl.js'
import { supabaseAdmin } from '../services/supabase.js'
import { ensureUserProfile } from './profiles.js'
import { sendEmployeePasswordSetupEmail, isEmailConfigured } from '../services/email.js'

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
    user_metadata: { provisioned_by: 'org_employee' },
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

async function sendPasswordSetupEmail(email, { orgName, employeeName }) {
  const redirectTo = `${getPublicAppUrl()}/reset-password`

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    console.warn('Could not generate employee password link:', error.message)
    return false
  }

  const actionLink = data?.properties?.action_link
  if (!actionLink) return false

  if (isEmailConfigured) {
    await sendEmployeePasswordSetupEmail(email, {
      resetUrl: actionLink,
      orgName,
      employeeName,
    })
    return true
  }

  console.log(`\n[Employee password setup link — Mailjet not configured]\n  ${email}\n  ${actionLink}\n`)
  return false
}

/**
 * Enables login for an org employee: links auth profile to org and sends password email.
 */
export async function provisionEmployeeLogin({
  email,
  orgId,
  orgName,
  employeeName,
  employeeId,
}) {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Email is required when login is enabled')
  }

  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, role, email')
    .ilike('email', normalized)
    .maybeSingle()

  if (profileError) throw profileError

  let userId

  if (existingProfile) {
    if (existingProfile.org_id && existingProfile.org_id !== orgId) {
      throw new Error('This email is already associated with another organization')
    }

    userId = existingProfile.id

    if (!existingProfile.org_id) {
      const { error: linkError } = await supabaseAdmin
        .from('profiles')
        .update({ org_id: orgId, role: 'member' })
        .eq('id', userId)

      if (linkError) throw linkError
    }
  } else {
    const { user } = await createAuthUser(normalized)
    userId = user.id
    await ensureUserProfile(userId, normalized)

    const { error: linkError } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: orgId, role: 'member' })
      .eq('id', userId)

    if (linkError) throw linkError
  }

  const { error: employeeError } = await supabaseAdmin
    .from('org_employees')
    .update({
      profile_id: userId,
      login_required: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId)
    .eq('org_id', orgId)

  if (employeeError) throw employeeError

  const emailSent = await sendPasswordSetupEmail(normalized, { orgName, employeeName })
  return { userId, emailSent }
}

export async function disableEmployeeLogin(employeeId, orgId) {
  const { error } = await supabaseAdmin
    .from('org_employees')
    .update({
      login_required: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId)
    .eq('org_id', orgId)

  if (error) throw error
}
