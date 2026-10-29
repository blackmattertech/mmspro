import crypto from 'crypto'
import { supabaseAdmin } from '../services/supabase.js'
import { generateOrgSlug, ensureUniqueSlug } from './slug.js'
import { ensureUserProfile } from './profiles.js'
import { ACCOUNT_ROLES } from './accountRoles.js'
import { limitsForPlan } from './orgLimits.js'
import { getPublicAppUrl } from './appUrl.js'
import { validatePhoneE164, normalizePhoneE164, validatePostalCode } from './contactValidation.js'
import { isEmailConfigured, sendCompanyWelcomeEmail } from '../services/email.js'
import { applyPlatformFormDefaults, applyPlatformHierarchyDefault } from './platformFormDefaults.js'

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function requiredText(value, label, max) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) throw fail(400, `${label} is required.`)
  if (trimmed.length > max) throw fail(400, `${label} must be ${max} characters or fewer.`)
  return trimmed
}

function optionalText(value, label, max) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  if (trimmed.length > max) throw fail(400, `${label} must be ${max} characters or fewer.`)
  return trimmed
}

function normalizeWebsite(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.length > 200) throw fail(400, 'Website must be 200 characters or fewer.')
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try {
    url = new URL(normalized)
  } catch {
    throw fail(400, 'Enter a valid website.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw fail(400, 'Enter a valid website.')
  }
  return normalized
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(12)
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}!`
}

function isEmailExistsError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === 'email_exists' ||
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  )
}

async function removeCreatedUser(userId) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) console.warn('Could not roll back signup user:', error.message)
}

/**
 * Validates landing-page company details. Does not create an account.
 */
export function parseLandingCompany(body = {}) {
  const companyName = requiredText(body.companyName, 'Company name', 120)
  const contactName = requiredText(body.contactName, 'Your name', 80)
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw fail(400, 'Enter a valid work email.')
  }

  const phoneError = validatePhoneE164(body.phone, { required: true })
  if (phoneError) throw fail(400, phoneError)
  const phone = normalizePhoneE164(body.phone)

  const website = normalizeWebsite(body.website)
  const taxId = optionalText(body.taxId, 'Tax ID', 32)
  const addressLine1 = optionalText(body.addressLine1, 'Address', 200)
  const city = optionalText(body.city, 'City', 80)
  const state = optionalText(body.state, 'State', 80)
  const country = optionalText(body.country, 'Country', 80)
  const postalCode = optionalText(body.postalCode, 'Postal code', 16)
  const postalError = validatePostalCode(postalCode || '', country || '')
  if (postalError) throw fail(400, postalError)

  return {
    companyName,
    contactName,
    email,
    phone,
    website,
    taxId,
    addressLine1,
    city,
    state,
    postalCode,
    country,
  }
}

export async function assertLandingEmailAvailable(email) {
  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (profileError) throw profileError
  if (existingProfile) {
    throw fail(409, 'This email already has an account. Sign in instead.')
  }
}

/**
 * Creates a company and owner, then emails the login and a temporary password.
 * Call this only after payment has been confirmed.
 */
export async function registerLandingCompany(body = {}) {
  const {
    companyName,
    contactName,
    email,
    phone,
    website,
    taxId,
    addressLine1,
    city,
    state,
    postalCode,
    country,
  } = parseLandingCompany(body)

  await assertLandingEmailAvailable(email)

  const password = temporaryPassword()
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      provisioned_by: 'landing_signup',
      full_name: contactName,
      company_name: companyName,
    },
  })
  if (createError) {
    if (isEmailExistsError(createError)) {
      throw fail(409, 'This email already has an account. Sign in instead.')
    }
    throw createError
  }

  const userId = created.user.id
  let orgId = null

  try {
    await ensureUserProfile(userId, email)
    const slug = await ensureUniqueSlug(generateOrgSlug(companyName))
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: companyName,
        slug,
        plan: 'free',
        is_active: true,
        email,
        phone,
        website,
        tax_id: taxId,
        address_line1: addressLine1,
        city,
        state,
        postal_code: postalCode,
        country,
        currency: 'INR',
        ...limitsForPlan('free'),
      })
      .select('id, name, slug')
      .single()

    if (orgError) throw orgError
    orgId = org.id

    const { error: assignError } = await supabaseAdmin
      .from('profiles')
      .update({
        org_id: org.id,
        role: ACCOUNT_ROLES.ADMIN,
        full_name: contactName,
        phone,
        email,
      })
      .eq('id', userId)

    if (assignError) throw assignError

    const { error: inviteError } = await supabaseAdmin.from('org_invites').insert({
      org_id: org.id,
      email,
      role: ACCOUNT_ROLES.ADMIN,
      accepted_at: new Date().toISOString(),
    })
    if (inviteError) console.warn('org_invites insert failed:', inviteError.message)

    try {
      await applyPlatformFormDefaults(org.id)
      await applyPlatformHierarchyDefault(org.id)
    } catch (defaultsErr) {
      console.warn('Default forms were not copied:', defaultsErr.message)
    }

    const loginUrl = `${getPublicAppUrl()}/login`
    let emailSent = false
    if (await isEmailConfigured()) {
      const result = await sendCompanyWelcomeEmail(email, {
        contactName,
        companyName,
        temporaryPassword: password,
        loginUrl,
      })
      emailSent = Boolean(result)
      if (!emailSent) console.warn(`Company welcome email failed to send → ${email}`)
    } else {
      console.log(`\n[Company welcome — Mailjet not configured]\n  ${companyName}\n  ${email}\n  ${loginUrl}\n  temporary password: ${password}\n`)
    }

    console.log(`Landing signup: ${org.slug} | owner: ${email} | email_sent: ${emailSent}`)

    return {
      ok: true,
      email,
      companyName: org.name,
      emailSent,
    }
  } catch (error) {
    if (orgId) {
      await supabaseAdmin.from('organizations').delete().eq('id', orgId)
    }
    await removeCreatedUser(userId)
    throw error
  }
}
