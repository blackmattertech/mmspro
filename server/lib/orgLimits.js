import { supabaseAdmin } from '../services/supabase.js'

export const PLAN_DEFAULTS = {
  free: {
    location_limit: 1,
    department_limit: 5,
    employee_limit: 25,
    login_limit: 3,
  },
  pro: {
    location_limit: 10,
    department_limit: 50,
    employee_limit: 500,
    login_limit: 50,
  },
  enterprise: {
    location_limit: null,
    department_limit: null,
    employee_limit: null,
    login_limit: null,
  },
}

export const LIMIT_FIELDS = [
  'location_limit',
  'department_limit',
  'employee_limit',
  'login_limit',
]

const RESOURCE_CONFIG = {
  location: {
    field: 'location_limit',
    label: 'Location',
    table: 'org_locations',
    activeOnly: true,
  },
  department: {
    field: 'department_limit',
    label: 'Department',
    table: 'departments',
    activeOnly: true,
  },
  employee: {
    field: 'employee_limit',
    label: 'Employee',
    table: 'org_employees',
    activeOnly: true,
  },
}

export function limitsForPlan(plan) {
  return { ...(PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free) }
}

export function parseLimitInput(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Limits must be a non-negative integer or empty for unlimited')
  }
  return parsed
}

export function parseLimitUpdates(body) {
  const updates = {}
  for (const field of LIMIT_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = parseLimitInput(body[field])
    }
  }
  return updates
}

async function fetchOrgLimits(orgId) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, plan, location_limit, department_limit, employee_limit, login_limit')
    .eq('id', orgId)
    .single()

  if (error) throw error
  return data
}

async function countActiveRows(table, orgId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (error) throw error
  return count || 0
}

async function countLogins(orgId) {
  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (error) throw error
  return count || 0
}

export async function getOrgUsage(orgId) {
  const [locations, departments, employees, logins] = await Promise.all([
    countActiveRows('org_locations', orgId),
    countActiveRows('departments', orgId),
    countActiveRows('org_employees', orgId),
    countLogins(orgId),
  ])

  return { locations, departments, employees, logins }
}

/**
 * Tally usage for many orgs with a few paged queries (not N×4 COUNTs).
 * Prefer RPC when available for large tenants.
 */
async function tallyOrgIds(table, orgIds, { activeOnly = false } = {}) {
  const map = Object.fromEntries(orgIds.map((id) => [id, 0]))
  if (!orgIds.length) return map

  const pageSize = 1000
  let from = 0
  for (;;) {
    let query = supabaseAdmin
      .from(table)
      .select('org_id')
      .in('org_id', orgIds)
      .range(from, from + pageSize - 1)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      if (row.org_id && map[row.org_id] != null) map[row.org_id] += 1
    }
    if (rows.length < pageSize) break
    from += pageSize
    if (from >= 200_000) break
  }
  return map
}

let bulkUsageRpcAvailable = true

async function getBulkOrgUsageViaRpc(orgIds) {
  const { data, error } = await supabaseAdmin.rpc('admin_org_usage_counts', {
    p_org_ids: orgIds,
  })
  if (error) throw error
  let parsed = data
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = null
    }
  }
  const usageByOrg = Object.fromEntries(
    orgIds.map((id) => [id, { locations: 0, departments: 0, employees: 0, logins: 0 }]),
  )
  if (!parsed || typeof parsed !== 'object') return usageByOrg
  for (const orgId of orgIds) {
    const row = parsed[orgId]
    if (!row) continue
    usageByOrg[orgId] = {
      locations: Number(row.locations) || 0,
      departments: Number(row.departments) || 0,
      employees: Number(row.employees) || 0,
      logins: Number(row.logins) || 0,
    }
  }
  return usageByOrg
}

export async function getBulkOrgUsage(orgIds) {
  const usageByOrg = Object.fromEntries(
    orgIds.map((id) => [id, { locations: 0, departments: 0, employees: 0, logins: 0 }]),
  )
  if (!orgIds.length) return usageByOrg

  if (bulkUsageRpcAvailable) {
    try {
      return await getBulkOrgUsageViaRpc(orgIds)
    } catch (err) {
      const message = String(err?.message || err?.code || '')
      if (/could not find the function|PGRST202|does not exist/i.test(message)) {
        bulkUsageRpcAvailable = false
      } else {
        console.error('[getBulkOrgUsage] RPC failed, using tally fallback:', err.message)
      }
    }
  }

  const [locations, departments, employees, logins] = await Promise.all([
    tallyOrgIds('org_locations', orgIds, { activeOnly: true }),
    tallyOrgIds('departments', orgIds, { activeOnly: true }),
    tallyOrgIds('org_employees', orgIds, { activeOnly: true }),
    tallyOrgIds('profiles', orgIds),
  ])

  for (const orgId of orgIds) {
    usageByOrg[orgId] = {
      locations: locations[orgId] || 0,
      departments: departments[orgId] || 0,
      employees: employees[orgId] || 0,
      logins: logins[orgId] || 0,
    }
  }
  return usageByOrg
}

function attachLimitMeta(err, extra = {}) {
  err.code = 'LIMIT_EXCEEDED'
  Object.assign(err, extra)
  return err
}

function limitError(label, usage, limit) {
  const err = new Error(
    `${label} limit reached (${usage}/${limit}). Contact your administrator to upgrade.`
  )
  err.status = 403
  return attachLimitMeta(err, { resource: label, usage, limit, overflow: 0 })
}

function bulkLimitError(label, { usage, limit, attempted }) {
  const overflow = Math.min(
    attempted,
    Math.max(0, usage + attempted - limit),
  )
  const rowLabel = overflow === 1 ? 'row' : 'rows'
  const err = new Error(
    `Beyond the ${label.toLowerCase()} limit (${limit}). Please delete ${overflow} ${rowLabel} from the file and try again.`
  )
  err.status = 403
  return attachLimitMeta(err, { resource: label, usage, limit, attempted, overflow })
}

export function httpErrorBody(err) {
  const body = { error: err?.message || 'Request failed' }
  if (err?.code === 'LIMIT_EXCEEDED') {
    body.code = err.code
    body.resource = err.resource
    body.limit = err.limit
    body.usage = err.usage
    body.attempted = err.attempted
    body.overflow = err.overflow
  }
  return body
}

export async function assertUnderLimit(orgId, resource) {
  const config = RESOURCE_CONFIG[resource]
  if (!config) throw new Error(`Unknown limit resource: ${resource}`)

  const org = await fetchOrgLimits(orgId)
  const limit = org[config.field]
  if (limit == null) return

  const usage = await countActiveRows(config.table, orgId)
  if (usage >= limit) {
    throw limitError(config.label, usage, limit)
  }
}

export async function assertBulkCreatesAllowed(orgId, resource, attemptedCreates) {
  const attempted = Number(attemptedCreates) || 0
  if (attempted <= 0) return

  const config = RESOURCE_CONFIG[resource]
  if (!config) throw new Error(`Unknown limit resource: ${resource}`)

  const org = await fetchOrgLimits(orgId)
  const limit = org[config.field]
  if (limit == null) return

  const usage = await countActiveRows(config.table, orgId)
  if (usage + attempted <= limit) return
  throw bulkLimitError(config.label, { usage, limit, attempted })
}

export async function assertUnderLimitIfReactivating(orgId, resource, wasActive, willBeActive) {
  if (wasActive || !willBeActive) return
  await assertUnderLimit(orgId, resource)
}

async function profileAlreadyInOrg(orgId, email) {
  if (!email?.trim()) return false

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .ilike('email', email.trim())
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function assertLoginSlotAvailable(orgId, { email } = {}) {
  const org = await fetchOrgLimits(orgId)
  const limit = org.login_limit
  if (limit == null) return

  if (email && await profileAlreadyInOrg(orgId, email)) {
    return
  }

  const usage = await countLogins(orgId)
  if (usage >= limit) {
    throw limitError('Login', usage, limit)
  }
}

export async function getOrgLimitsSummary(orgId) {
  const org = await fetchOrgLimits(orgId)
  const usage = await getOrgUsage(orgId)

  return {
    limits: {
      location_limit: org.location_limit,
      department_limit: org.department_limit,
      employee_limit: org.employee_limit,
      login_limit: org.login_limit,
    },
    usage,
  }
}
