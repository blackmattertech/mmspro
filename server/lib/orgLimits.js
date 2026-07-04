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

export async function getBulkOrgUsage(orgIds) {
  const usageByOrg = Object.fromEntries(
    orgIds.map((id) => [id, { locations: 0, departments: 0, employees: 0, logins: 0 }])
  )

  if (!orgIds.length) return usageByOrg

  const [locations, departments, employees, profiles] = await Promise.all([
    supabaseAdmin.from('org_locations').select('org_id').in('org_id', orgIds).eq('is_active', true),
    supabaseAdmin.from('departments').select('org_id').in('org_id', orgIds).eq('is_active', true),
    supabaseAdmin.from('org_employees').select('org_id').in('org_id', orgIds).eq('is_active', true),
    supabaseAdmin.from('profiles').select('org_id').in('org_id', orgIds),
  ])

  for (const row of locations.data || []) {
    usageByOrg[row.org_id].locations += 1
  }
  for (const row of departments.data || []) {
    usageByOrg[row.org_id].departments += 1
  }
  for (const row of employees.data || []) {
    usageByOrg[row.org_id].employees += 1
  }
  for (const row of profiles.data || []) {
    if (row.org_id) usageByOrg[row.org_id].logins += 1
  }

  return usageByOrg
}

function limitError(label, usage, limit) {
  const err = new Error(
    `${label} limit reached (${usage}/${limit}). Contact your administrator to upgrade.`
  )
  err.status = 403
  return err
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
