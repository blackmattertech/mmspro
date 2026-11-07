import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../services/supabase.js'
import { ACCOUNT_ROLES } from './accountRoles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
let clientEnvLoaded = false

function loadClientEnvFallback() {
  if (clientEnvLoaded) return
  clientEnvLoaded = true
  try {
    const text = readFileSync(resolve(__dirname, '../../client/.env'), 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const key = match[1]
      if (process.env[key] != null && process.env[key] !== '') continue
      let value = match[2]
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // client/.env is optional in production
  }
}

function resolveAuthConfig() {
  loadClientEnvFallback()
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return { url, anonKey }
}

/**
 * Sibling tables with ON DELETE RESTRICT to departments/locations/areas/statuses.
 * Must be cleared before deleting the organization row.
 */
export const ORG_DELETE_RESTRICT_BLOCKERS = [
  'pm_plan_audit',
  'pm_plan_technicians',
  'pm_plans',
  'work_request_timeline',
  'work_requests',
  'equipment_meter_readings',
  'equipment_values',
  'equipment',
  'task_activities',
  'task_comments',
  'task_attachments',
  'task_links',
  'task_reminders',
  'task_recurrence',
  'task_assignees',
  'task_tag_assignments',
  'task_references',
  'tasks',
]

function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

function isMissingTable(error) {
  return /does not exist|Could not find the table|schema cache/i.test(error?.message || '')
}

async function listStorageFiles(bucket, prefix = '') {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  })
  if (error) {
    if (/not found|does not exist/i.test(error.message || '')) return []
    throw error
  }

  const paths = []
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id == null && !entry.metadata) {
      paths.push(...(await listStorageFiles(bucket, path)))
    } else {
      paths.push(path)
    }
  }
  return paths
}

async function deleteOrgRowsById(table, orgId, { dryRun = false, onSkip } = {}) {
  const { data, error: listError } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('org_id', orgId)

  if (listError) {
    if (isMissingTable(listError)) {
      onSkip?.(table)
      return 0
    }
    throw listError
  }

  const ids = (data || []).map((row) => row.id).filter(Boolean)
  if (!ids.length) return 0
  if (dryRun) return ids.length

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { error } = await supabaseAdmin.from(table).delete().in('id', chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  return ids.length
}

async function wipeOrgStorage(orgId, memberUserIds, { dryRun = false } = {}) {
  const buckets = [
    { name: 'org-assets', prefixes: [orgId] },
    { name: 'work-order-assets', prefixes: [orgId] },
    { name: 'user-assets', prefixes: memberUserIds },
  ]

  let total = 0
  for (const bucket of buckets) {
    for (const prefix of bucket.prefixes) {
      if (!prefix) continue
      let paths
      try {
        paths = await listStorageFiles(bucket.name, prefix)
      } catch (err) {
        console.warn(`deleteOrganization storage skip ${bucket.name}/${prefix}:`, err.message)
        continue
      }
      if (!paths.length) continue
      if (!dryRun) {
        const chunkSize = 100
        for (let i = 0; i < paths.length; i += chunkSize) {
          const chunk = paths.slice(i, i + chunkSize)
          const { error } = await supabaseAdmin.storage.from(bucket.name).remove(chunk)
          if (error) throw error
        }
      }
      total += paths.length
    }
  }
  return total
}

/**
 * Verifies the signed-in Super Admin's password before destructive actions.
 */
export async function verifySuperAdminPassword(user, password) {
  const email = String(user?.email || '').trim().toLowerCase()
  const pass = String(password || '')
  if (!email) throw httpError('Could not verify your account email', 400)
  if (!pass) throw httpError('Password is required', 400)

  const { url, anonKey } = resolveAuthConfig()
  if (!url || !anonKey) {
    throw httpError(
      'Password verification is not configured on the server. Add SUPABASE_ANON_KEY to server/.env (same value as the client anon key).',
      500,
    )
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await authClient.auth.signInWithPassword({ email, password: pass })
  if (error || !data?.user) {
    throw httpError('Incorrect password', 401)
  }
  if (data.user.id !== user.id) {
    throw httpError('Incorrect password', 401)
  }

  try {
    await authClient.auth.signOut()
  } catch {
    // ignore
  }
}

/**
 * Deletes one organization and all related tenant data.
 * Super Admin profiles linked to the org are detached, not deleted.
 */
export async function deleteOrganizationById(orgId, { dryRun = false } = {}) {
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, email, created_at')
    .eq('id', orgId)
    .maybeSingle()
  if (orgError) throw orgError
  if (!org) throw httpError('Organization not found', 404)

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, org_id')
    .eq('org_id', orgId)
  if (profileError) throw profileError

  const allProfiles = profiles || []
  const members = allProfiles.filter((row) => row.role !== ACCOUNT_ROLES.SUPER_ADMIN)
  const superAdmins = allProfiles.filter((row) => row.role === ACCOUNT_ROLES.SUPER_ADMIN)

  const counts = {
    restrictRows: 0,
    profilesDeleted: 0,
    authUsersDeleted: 0,
    storageObjects: 0,
    superAdminsDetached: superAdmins.length,
  }

  if (superAdmins.length && !dryRun) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: null })
      .in('id', superAdmins.map((row) => row.id))
    if (error) throw error
  }

  for (const table of ORG_DELETE_RESTRICT_BLOCKERS) {
    counts.restrictRows += await deleteOrgRowsById(table, orgId, {
      dryRun,
      onSkip: (name) => console.warn(`deleteOrganization skip ${name}: not present`),
    })
  }

  if (!dryRun) {
    const { error } = await supabaseAdmin.from('organizations').delete().eq('id', orgId)
    if (error) throw error
  }

  for (const row of members) {
    if (!dryRun) {
      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', row.id)
      if (error) throw error
    }
    counts.profilesDeleted += 1
  }

  for (const row of members) {
    if (!dryRun) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(row.id)
      if (error && !/not found|User not found/i.test(error.message || '')) {
        throw error
      }
    }
    counts.authUsersDeleted += 1
  }

  counts.storageObjects = await wipeOrgStorage(
    orgId,
    members.map((row) => row.id),
    { dryRun },
  )

  return {
    organization: org,
    dryRun: Boolean(dryRun),
    counts,
    deletedEmails: members.map((row) => row.email).filter(Boolean),
  }
}
