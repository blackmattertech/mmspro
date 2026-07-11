import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { generateOrgSlug, ensureUniqueSlug } from '../../lib/slug.js'
import {
  findOrCreateOwnerByEmail,
  sendOwnerAccessEmail,
} from '../../lib/ensureOwnerUser.js'
import {
  limitsForPlan,
  parseLimitUpdates,
  getBulkOrgUsage,
  LIMIT_FIELDS,
} from '../../lib/orgLimits.js'
import { ACCOUNT_ROLES } from '../../lib/accountRoles.js'

const router = Router()
const ORG_ASSETS_BUCKET = 'org-assets'
const LIST_SIGNED_URL_LIMIT = 25

const ORG_SELECT = `
  id, name, slug, plan, is_active, created_at, logo_url,
  location_limit, department_limit, employee_limit, login_limit
`

async function attachOrgLogoUrl(org) {
  if (!org?.logo_url) return org

  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(org.logo_url, 3600)

  if (!error && data?.signedUrl) {
    return { ...org, logo_signed_url: data.signedUrl }
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
  const { data: orgs, error } = await supabaseAdmin
    .from('organizations')
    .select(ORG_SELECT)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })

  const orgIds = (orgs || []).map((org) => org.id)
  const [usageByOrg, profilesResult] = await Promise.all([
    getBulkOrgUsage(orgIds),
    supabaseAdmin.from('profiles').select('org_id'),
  ])

  if (profilesResult.error) {
    return res.status(500).json({ error: profilesResult.error.message })
  }

  const memberCounts = (profilesResult.data || []).reduce((acc, row) => {
    if (row.org_id) acc[row.org_id] = (acc[row.org_id] || 0) + 1
    return acc
  }, {})

  const result = (orgs || []).map((org) => ({
    ...org,
    member_count: memberCounts[org.id] || 0,
    usage: usageByOrg[org.id] || {
      locations: 0,
      departments: 0,
      employees: 0,
      logins: 0,
    },
  }))

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
  const { name, slug: slugInput, plan = 'free', ownerEmail } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Organization name is required' })
  }

  if (!ownerEmail?.trim()) {
    return res.status(400).json({ error: 'Owner email is required' })
  }

  if (!['free', 'pro', 'enterprise'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' })
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
      .select(ORG_SELECT)
      .single()

    if (orgError) return res.status(500).json({ error: orgError.message })

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
  })
  } catch (err) {
    console.error('Create organization failed:', err.message)
    const status = err.status || 500
    res.status(status).json({ error: err.message || 'Failed to create organization' })
  }
})

router.patch('/:id', async (req, res) => {
  const { id } = req.params
  const { is_active, name, plan, apply_plan_limits } = req.body

  const updates = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (name?.trim()) updates.name = name.trim()
  if (plan && ['free', 'pro', 'enterprise'].includes(plan)) updates.plan = plan

  try {
    if (apply_plan_limits && plan) {
      Object.assign(updates, limitsForPlan(plan))
    } else {
      Object.assign(updates, parseLimitUpdates(req.body))
    }
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select(ORG_SELECT)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return res.status(404).json({ error: 'Organization not found' })
    return res.status(500).json({ error: error.message })
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
