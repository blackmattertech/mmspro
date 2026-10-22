import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { adminOnly } from '../../middleware/adminOnly.js'
import { supabaseAdmin } from '../../services/supabase.js'
import organizationRoutes from './organizations.js'
import integrationRoutes from './integrations.js'
import planRoutes from './plans.js'
import reportRoutes from './reports.js'
import orgAssetFieldsRoutes from './orgAssetFields.js'
import orgEquipmentFieldsRoutes from './orgEquipmentFields.js'
import orgFormLayoutsRoutes from './orgFormLayouts.js'
import { loadSubscriptionDashboard, scheduleSubscriptionSync } from '../../lib/platformSubscriptions.js'
import { getSignedUrls } from '../../lib/signedUrlCache.js'

const ORG_ASSETS_BUCKET = 'org-assets'

const router = Router()
router.use(verifyAuth, adminOnly)

function parsePagination(query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const rawLimit = Number(query.limit)
  const rawOffset = Number(query.offset)
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short' }) + ' ' + String(date.getFullYear()).slice(2)
}

function buildDashboardStats(orgs, profiles, userTotal) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const organizations = orgs || []
  const people = profiles || []
  const usersByOrg = {}
  for (const person of people) {
    if (!person.org_id) continue
    usersByOrg[person.org_id] = (usersByOrg[person.org_id] || 0) + 1
  }

  const planCounts = { free: 0, pro: 0, enterprise: 0 }
  for (const org of organizations) {
    const plan = planCounts[org.plan] != null ? org.plan : 'free'
    planCounts[plan] += 1
  }

  const growth = []
  for (let index = 11; index >= 0; index -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    const existing = organizations.filter((org) => new Date(org.created_at) < end)
    growth.push({
      label: monthLabel(start),
      total: existing.length,
      active: existing.filter((org) => org.is_active).length,
      users: people.filter((person) => person.created_at && new Date(person.created_at) < end).length,
    })
  }

  const companies = organizations
    .map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan || 'free',
      is_active: Boolean(org.is_active),
      users: usersByOrg[org.id] || 0,
      created_at: org.created_at,
      logo_url: org.logo_url || null,
    }))
    .sort((left, right) => right.users - left.users || String(left.name).localeCompare(String(right.name)))

  const activity = [
    ...organizations.map((org) => ({
      id: `org-${org.id}`,
      kind: 'company',
      title: `New company “${org.name}” registered`,
      at: org.created_at,
    })),
    ...people.slice(0, 40).map((person) => ({
      id: `user-${person.id}`,
      kind: person.role === 'org_admin' ? 'user' : 'member',
      title: person.email ? `New user ${person.email} added` : 'New user added',
      at: person.created_at,
    })),
  ]
    .filter((item) => item.at)
    .sort((left, right) => new Date(right.at) - new Date(left.at))
    .slice(0, 6)

  const createdThisMonth = (rows) => rows.filter((row) => new Date(row.created_at) >= monthStart).length

  return {
    totalOrganizations: organizations.length,
    activeOrganizations: organizations.filter((org) => org.is_active).length,
    totalUsers: userTotal,
    newOrganizationsThisMonth: createdThisMonth(organizations),
    newUsersThisMonth: createdThisMonth(people),
    paidPlans: organizations.filter((org) => org.plan === 'pro' || org.plan === 'enterprise').length,
    planCounts,
    growth,
    companies,
    activity,
  }
}

router.get('/stats', async (_req, res) => {
  const subscriptionsPromise = loadSubscriptionDashboard({ sync: false }).catch((error) => {
    console.warn('Subscription stats failed:', error.message)
    return null
  })
  const [orgsRes, orgsCountRes, activeCountRes, usersCountRes, profilesRes, subscriptions] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id, name, slug, plan, is_active, created_at, logo_url')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('profiles')
      .select('id, email, role, org_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    subscriptionsPromise,
  ])

  if (orgsRes.error) return res.status(500).json({ error: orgsRes.error.message })
  if (profilesRes.error) return res.status(500).json({ error: profilesRes.error.message })

  const stats = buildDashboardStats(
    orgsRes.data,
    profilesRes.data,
    usersCountRes.count || (profilesRes.data || []).length,
  )
  const logoPaths = stats.companies.map((company) => company.logo_url).filter(Boolean)
  if (logoPaths.length) {
    const signed = await getSignedUrls(ORG_ASSETS_BUCKET, logoPaths)
    stats.companies = stats.companies.map((company) => ({
      ...company,
      logo_signed_url: company.logo_url ? signed.get(company.logo_url) || null : null,
    }))
  }
  if (orgsCountRes.count != null) stats.totalOrganizations = orgsCountRes.count
  if (activeCountRes.count != null) stats.activeOrganizations = activeCountRes.count
  stats.subscriptions = subscriptions
  if (stats.subscriptions?.recent?.length) {
    const subscriptionActivity = stats.subscriptions.recent.slice(0, 6).map((row) => ({
      id: `sub-${row.id}`,
      kind: 'subscription',
      title: row.status === 'PAID'
        ? `${row.planName} subscription paid on Cashfree`
        : `${row.planName} checkout started on Cashfree`,
      at: row.paidAt || row.createdAt,
    }))
    stats.activity = [...subscriptionActivity, ...(stats.activity || [])]
      .filter((item) => item.at)
      .sort((left, right) => new Date(right.at) - new Date(left.at))
      .slice(0, 6)
  }
  res.json(stats)
  if (subscriptions?.tableReady) scheduleSubscriptionSync()
})

router.use('/integrations', integrationRoutes)
router.use('/plans', planRoutes)
router.use('/reports', reportRoutes)
router.use('/organizations/:orgId/asset-fields', orgAssetFieldsRoutes)
router.use('/organizations/:orgId/equipment-fields', orgEquipmentFieldsRoutes)
router.use('/organizations/:orgId/form-layouts', orgFormLayoutsRoutes)
router.use('/organizations', organizationRoutes)

router.get('/users', async (req, res) => {
  const { limit, offset } = parsePagination(req.query)
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, org_id, created_at, organizations(name, slug)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
