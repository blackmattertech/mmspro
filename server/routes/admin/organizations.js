import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { generateOrgSlug, ensureUniqueSlug } from '../../lib/slug.js'
import {
  findOrCreateOwnerByEmail,
  sendOwnerAccessEmail,
} from '../../lib/ensureOwnerUser.js'
import {
  PLAN_DEFAULTS,
  limitsForPlan,
  parseLimitUpdates,
  getBulkOrgUsage,
  LIMIT_FIELDS,
} from '../../lib/orgLimits.js'
import { ACCOUNT_ROLES } from '../../lib/accountRoles.js'
import { getSignedUrl } from '../../lib/signedUrlCache.js'
import { parseDisabledModulesInput, isMissingDisabledModulesColumn } from '../../lib/orgModules.js'
import { invalidatePermissionsCache } from '../../lib/requestCache.js'
import { applyPlatformFormDefaults, applyPlatformHierarchyDefault } from '../../lib/platformFormDefaults.js'

const router = Router()
const ORG_ASSETS_BUCKET = 'org-assets'
const LIST_SIGNED_URL_LIMIT = 25

const ORG_SELECT_BASE = `
  id, name, slug, plan, is_active, created_at, logo_url,
  location_limit, department_limit, employee_limit, login_limit
`
const ORG_SELECT = `${ORG_SELECT_BASE},
  disabled_modules
`

async function selectOrganizations(buildQuery) {
  const withModules = await buildQuery(ORG_SELECT)
  if (!withModules.error || !isMissingDisabledModulesColumn(withModules.error)) {
    return withModules
  }
  const fallback = await buildQuery(ORG_SELECT_BASE)
  if (Array.isArray(fallback.data)) {
    fallback.data = fallback.data.map((row) => ({ ...row, disabled_modules: [] }))
  } else if (fallback.data) {
    fallback.data = { ...fallback.data, disabled_modules: [] }
  }
  return fallback
}

async function attachOrgLogoUrl(org) {
  if (!org?.logo_url) return org

  const signedUrl = await getSignedUrl(ORG_ASSETS_BUCKET, org.logo_url)
  if (signedUrl) {
    return { ...org, logo_signed_url: signedUrl }
  }
  return org
}

async function attachOrgLogoUrls(orgs) {
  return Promise.all((orgs || []).map(attachOrgLogoUrl))
}

function mergePlanLimits(plan, body) {
  const defaults = limitsForPlan(plan)
  const custom = parseLimitUpdates(body)
  const hasCustom = LIMIT_FIELDS.some((field) => body[field] !== undefined)
  return hasCustom ? { ...defaults, ...custom } : defaults
}

async function resolveOrganizationPlan(body) {
  if (body.planId) {
    const { data, error } = await supabaseAdmin
      .from('platform_plans')
      .select('id, name, is_active')
      .eq('id', body.planId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) {
      const err = new Error('Choose a plan')
      err.status = 400
      throw err
    }
    if (data.is_active === false) {
      const err = new Error('That plan is inactive')
      err.status = 400
      throw err
    }
    return data.name
  }

  const plan = String(body.plan || '').trim()
  if (['free', 'pro', 'enterprise'].includes(plan)) return plan
  if (!plan) {
    const err = new Error('Choose a plan')
    err.status = 400
    throw err
  }

  const { data, error } = await supabaseAdmin
    .from('platform_plans')
    .select('name, is_active')
    .eq('name', plan)
    .limit(1)
  if (error) throw new Error(error.message)
  const match = data?.[0]
  if (!match || match.is_active === false) {
    const err = new Error('Choose a plan')
    err.status = 400
    throw err
  }
  return match.name
}

function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

router.get('/', async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  const { data: orgs, error } = await selectOrganizations((cols) => (
    supabaseAdmin
      .from('organizations')
      .select(cols)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
  ))

  if (error) return res.status(500).json({ error: error.message })

  const orgIds = (orgs || []).map((org) => org.id)
  const usageByOrg = await getBulkOrgUsage(orgIds)

  const result = (orgs || []).map((org) => {
    const usage = usageByOrg[org.id] || {
      locations: 0,
      departments: 0,
      employees: 0,
      logins: 0,
    }
    return {
      ...org,
      member_count: usage.logins || 0,
      usage,
    }
  })

  const pageResult = await attachOrgLogoUrls(result.slice(0, LIST_SIGNED_URL_LIMIT))
  if (result.length <= LIST_SIGNED_URL_LIMIT) {
    return res.json(pageResult)
  }
  res.json([
    ...pageResult,
    ...result.slice(LIST_SIGNED_URL_LIMIT),
  ])
})

router.post('/', async (req, res) => {
  const { name, slug: slugInput, ownerEmail } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Organization name is required' })
  }

  if (!ownerEmail?.trim()) {
    return res.status(400).json({ error: 'Owner email is required' })
  }

  let plan
  try {
    plan = await resolveOrganizationPlan(req.body)
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }

  try {
    const baseSlug = slugInput?.trim() || generateOrgSlug(name)
    const slug = await ensureUniqueSlug(baseSlug)
    const orgName = name.trim()
    const normalizedEmail = ownerEmail.trim().toLowerCase()
    const planLimits = mergePlanLimits(plan, req.body)

    const owner = await findOrCreateOwnerByEmail(normalizedEmail)

    if (owner.existingOrgId) {
      return res.status(400).json({ error: 'User already belongs to another organization' })
    }

    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: orgName,
        slug,
        plan,
        is_active: true,
        email: normalizedEmail,
        ...planLimits,
      })
      .select(ORG_SELECT_BASE)
      .single()

    if (orgError) return res.status(500).json({ error: orgError.message })
    org.disabled_modules = []

    const { error: assignError } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: org.id, role: ACCOUNT_ROLES.ADMIN })
      .eq('id', owner.userId)

    if (assignError) {
      await supabaseAdmin.from('organizations').delete().eq('id', org.id)
      return res.status(500).json({ error: assignError.message })
    }

    const { error: inviteError } = await supabaseAdmin.from('org_invites').insert({
      org_id: org.id,
      email: normalizedEmail,
      role: ACCOUNT_ROLES.ADMIN,
      accepted_at: new Date().toISOString(),
    })

    if (inviteError) {
      console.warn('org_invites insert failed:', inviteError.message)
    }

    let defaultFormsApplied = 0
    try {
      const defaults = await applyPlatformFormDefaults(org.id)
      defaultFormsApplied = defaults.applied || 0
      await applyPlatformHierarchyDefault(org.id)
    } catch (defaultsErr) {
      console.warn('Default forms were not copied:', defaultsErr.message)
    }

    let emailSent = false
    try {
      emailSent = await sendOwnerAccessEmail(normalizedEmail, { orgName })
    } catch (emailErr) {
      console.warn('Owner access email failed:', emailErr.message)
    }

    console.log(
      `Organization created: ${org.slug} | owner: ${normalizedEmail} | new_account: ${owner.created} | email_sent: ${emailSent}`
    )

  res.json({
    ...(await attachOrgLogoUrl(org)),
    member_count: 1,
    usage: { locations: 0, departments: 0, employees: 0, logins: 1 },
    owner_created: owner.created,
    owner_email: normalizedEmail,
    email_sent: emailSent,
    default_forms_applied: defaultFormsApplied,
  })
  } catch (err) {
    console.error('Create organization failed:', err.message)
    const status = err.status || 500
    res.status(status).json({ error: err.message || 'Failed to create organization' })
  }
})

router.get('/:id', async (req, res) => {
  const { data, error } = await selectOrganizations((cols) => (
    supabaseAdmin
      .from('organizations')
      .select(cols)
      .eq('id', req.params.id)
      .maybeSingle()
  ))

  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Organization not found' })

  const [usage, { count }] = await Promise.all([
    getBulkOrgUsage([data.id]).then((map) => map[data.id]),
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', data.id),
  ])

  res.json({
    ...(await attachOrgLogoUrl(data)),
    member_count: count || 0,
    usage: usage || { locations: 0, departments: 0, employees: 0, logins: 0 },
  })
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { is_active, name, plan, apply_plan_limits, disabled_modules } = req.body

  const updates = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (name?.trim()) updates.name = name.trim()
  if (req.body.planId || plan) {
    try {
      updates.plan = await resolveOrganizationPlan(req.body)
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message })
    }
  }
  if (disabled_modules !== undefined) {
    try {
      updates.disabled_modules = parseDisabledModulesInput(disabled_modules)
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message })
    }
  }

  try {
    if (apply_plan_limits && updates.plan && PLAN_DEFAULTS[updates.plan]) {
      Object.assign(updates, limitsForPlan(updates.plan))
    } else {
      Object.assign(updates, parseLimitUpdates(req.body))
    }
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const { data, error } = updates.disabled_modules
    ? await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select(ORG_SELECT)
      .single()
    : await selectOrganizations((cols) => (
      supabaseAdmin
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select(cols)
        .single()
    ))

  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Organization not found' })
    if (isMissingDisabledModulesColumn(error) && updates.disabled_modules) {
      return res.status(500).json({
        error: 'Apply supabase-patches/79-org-disabled-modules.sql before changing modules.',
      })
    }
    return res.status(500).json({ error: error.message })
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'disabled_modules')) {
    invalidatePermissionsCache()
  }

  const [usage, { count }] = await Promise.all([
    getBulkOrgUsage([id]).then((map) => map[id]),
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', id),
  ])

  res.json({
    ...(await attachOrgLogoUrl(data)),
    member_count: count || 0,
    usage: usage || { locations: 0, departments: 0, employees: 0, logins: 0 },
  })
})

export default router
