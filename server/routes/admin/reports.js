import { Router } from 'express'
import { supabaseAdmin } from '../../services/supabase.js'
import { getBulkOrgUsage } from '../../lib/orgLimits.js'
import { ACCOUNT_ROLE_LABELS } from '../../lib/accountRoles.js'

const router = Router()
const ROW_CAP = 500

const PLAN_LABELS = {
  free: 'Starter',
  pro: 'Professional',
  enterprise: 'Enterprise',
}

const REPORT_TYPES = [
  {
    key: 'companies',
    title: 'Companies',
    about: 'Companies on the platform, with plan, status, and how much of their account they use.',
    statuses: [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
    ],
  },
  {
    key: 'subscriptions',
    title: 'Subscriptions',
    about: 'Checkout and subscription status, plan, amount, and expiry for each company.',
    statuses: [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'trial', label: 'Trial' },
      { value: 'expired', label: 'Expired' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'failed', label: 'Failed' },
    ],
  },
  {
    key: 'users',
    title: 'Users',
    about: 'People who can sign in, the company they belong to, and their role.',
    statuses: [
      { value: 'all', label: 'All roles' },
      { value: 'super_admin', label: 'Super Admin' },
      { value: 'admin', label: 'Admin' },
      { value: 'user', label: 'User' },
    ],
  },
]

router.get('/', async (req, res) => {
  try {
    const key = String(req.query.key || REPORT_TYPES[0].key)
    const type = REPORT_TYPES.find((item) => item.key === key)
    if (!type) return res.status(404).json({ error: 'Unknown report' })

    const report = key === 'subscriptions'
      ? await subscriptionsReport(req.query)
      : key === 'users'
        ? await usersReport(req.query)
        : await companiesReport(req.query)

    res.json({
      types: REPORT_TYPES.map(({ key: typeKey, title, about, statuses }) => ({
        key: typeKey,
        title,
        about,
        statuses,
      })),
      report,
    })
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not load the report' })
  }
})

function planLabel(plan) {
  const key = String(plan || 'free').toLowerCase()
  return PLAN_LABELS[key] || plan || 'Starter'
}

function inRange(value, from, to) {
  if (!from && !to) return true
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  if (from) {
    const start = new Date(`${from}T00:00:00`)
    if (Number.isFinite(start.getTime()) && time < start.getTime()) return false
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`)
    if (Number.isFinite(end.getTime()) && time > end.getTime()) return false
  }
  return true
}

function matches(search, parts) {
  const needle = String(search || '').trim().toLowerCase()
  if (!needle) return true
  return parts.some((part) => String(part || '').toLowerCase().includes(needle))
}

function subscriptionState(row) {
  if (row.status === 'PAID' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'expired', key: 'expired' }
  }
  if (row.status === 'PAID') return { label: 'Active', tone: 'active', key: 'active' }
  if (row.status === 'ACTIVE') return { label: 'Trial', tone: 'trial', key: 'trial' }
  if (row.status === 'EXPIRED') return { label: 'Expired', tone: 'expired', key: 'expired' }
  if (row.status === 'TERMINATED') return { label: 'Cancelled', tone: 'cancelled', key: 'cancelled' }
  return { label: 'Failed', tone: 'failed', key: 'failed' }
}

function companyNameFromSignup(signup) {
  if (!signup || typeof signup !== 'object') return ''
  return signup.companyName || signup.company_name || ''
}

function contactFromSignup(signup) {
  if (!signup || typeof signup !== 'object') return { name: '', email: '' }
  return {
    name: signup.contactName || signup.contact_name || '',
    email: signup.email || '',
  }
}

async function selectOrganizations() {
  const full = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, plan, is_active, created_at, email, city')
    .order('name')
    .limit(1000)
  if (!full.error) return full.data || []
  if (!/email|city|PGRST204/i.test(full.error.message || '')) throw full.error
  const fallback = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, plan, is_active, created_at')
    .order('name')
    .limit(1000)
  if (fallback.error) throw fallback.error
  return fallback.data || []
}

async function companiesReport(query) {
  const organizations = await selectOrganizations()
  const usage = await getBulkOrgUsage(organizations.map((org) => org.id))
  const status = String(query.status || 'all')
  const rows = []

  for (const org of organizations) {
    const counts = usage[org.id] || {}
    const active = Boolean(org.is_active)
    const stateKey = active ? 'active' : 'inactive'
    if (status !== 'all' && status !== stateKey) continue
    if (!inRange(org.created_at, query.date_from, query.date_to)) continue
    const plan = planLabel(org.plan)
    if (!matches(query.search, [org.name, org.slug, org.email, org.city, plan, stateKey])) continue
    rows.push({
      id: org.id,
      company: org.name,
      plan,
      status: active ? 'Active' : 'Inactive',
      status_tone: active ? 'active' : 'inactive',
      users: counts.logins || 0,
      locations: counts.locations || 0,
      employees: counts.employees || 0,
      email: org.email || '',
      created: org.created_at,
    })
    if (rows.length >= ROW_CAP) break
  }

  return {
    key: 'companies',
    title: 'Companies',
    about: REPORT_TYPES[0].about,
    columns: [
      { id: 'company', label: 'Company' },
      { id: 'plan', label: 'Plan' },
      { id: 'status', label: 'Status' },
      { id: 'users', label: 'Users' },
      { id: 'locations', label: 'Locations' },
      { id: 'employees', label: 'Employees' },
      { id: 'email', label: 'Email' },
      { id: 'created', label: 'Created', format: 'date' },
    ],
    rows,
    total: rows.length,
    truncated: rows.length >= ROW_CAP,
    warnings: [],
  }
}

async function selectSubscriptions() {
  const full = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, plan_name, order_id, amount, currency, status, environment, paid_at, expires_at, created_at, signup')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (!full.error) return { rows: full.data || [], warning: '' }
  const message = full.error.message || ''
  if (/platform_subscriptions|PGRST205|schema cache|does not exist/i.test(message)) {
    return { rows: [], warning: 'Subscription storage is not set up yet.' }
  }
  if (!/signup|PGRST204/i.test(message)) throw full.error
  const fallback = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, plan_name, order_id, amount, currency, status, environment, paid_at, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (fallback.error) throw fallback.error
  return { rows: fallback.data || [], warning: '' }
}

async function subscriptionsReport(query) {
  const { rows: source, warning } = await selectSubscriptions()
  const status = String(query.status || 'all')
  const rows = []

  for (const row of source) {
    const state = subscriptionState(row)
    if (status !== 'all' && status !== state.key) continue
    const when = row.paid_at || row.created_at
    if (!inRange(when, query.date_from, query.date_to)) continue
    const company = companyNameFromSignup(row.signup)
    const contact = contactFromSignup(row.signup)
    if (!matches(query.search, [company, contact.name, contact.email, row.plan_name, row.order_id, state.label])) continue
    rows.push({
      id: row.id,
      company: company || '—',
      contact: contact.name,
      email: contact.email,
      plan: row.plan_name,
      amount: row.amount,
      currency: row.currency || 'INR',
      status: state.label,
      status_tone: state.tone,
      paid: row.paid_at,
      expires: row.expires_at,
      environment: row.environment === 'production' ? 'Live' : 'Sandbox',
    })
    if (rows.length >= ROW_CAP) break
  }

  return {
    key: 'subscriptions',
    title: 'Subscriptions',
    about: REPORT_TYPES[1].about,
    columns: [
      { id: 'company', label: 'Company' },
      { id: 'contact', label: 'Contact' },
      { id: 'email', label: 'Email' },
      { id: 'plan', label: 'Plan' },
      { id: 'amount', label: 'Amount', format: 'money' },
      { id: 'status', label: 'Status' },
      { id: 'paid', label: 'Paid', format: 'date' },
      { id: 'expires', label: 'Expires', format: 'date' },
      { id: 'environment', label: 'Environment' },
    ],
    rows,
    total: rows.length,
    truncated: rows.length >= ROW_CAP,
    warnings: warning ? [warning] : [],
  }
}

async function usersReport(query) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, created_at, organizations(name)')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error

  const status = String(query.status || 'all')
  const rows = []
  for (const person of data || []) {
    if (status !== 'all' && person.role !== status) continue
    if (!inRange(person.created_at, query.date_from, query.date_to)) continue
    const company = person.organizations?.name || ''
    const role = ACCOUNT_ROLE_LABELS[person.role] || person.role || 'User'
    if (!matches(query.search, [person.email, company, role])) continue
    rows.push({
      id: person.id,
      email: person.email || '',
      role,
      company: company || '—',
      joined: person.created_at,
    })
    if (rows.length >= ROW_CAP) break
  }

  return {
    key: 'users',
    title: 'Users',
    about: REPORT_TYPES[2].about,
    columns: [
      { id: 'email', label: 'Email' },
      { id: 'role', label: 'Role' },
      { id: 'company', label: 'Company' },
      { id: 'joined', label: 'Joined', format: 'date' },
    ],
    rows,
    total: rows.length,
    truncated: rows.length >= ROW_CAP,
    warnings: [],
  }
}

export default router
