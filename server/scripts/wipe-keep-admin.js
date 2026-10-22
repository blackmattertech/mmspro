/**
 * Fresh-start wipe: clear all app / org data, keep Super Admin login(s).
 *
 * Keeps:
 *   - auth.users for profiles.role = 'super_admin'
 *   - those profile rows (org_id cleared)
 *   - optional: their user-assets/{user_id}/ files
 *
 * Deletes:
 *   - all organizations (and cascaded org data: employees, WOs, tasks, PM, etc.)
 *   - all non–Super Admin profiles
 *   - all non–Super Admin auth users
 *   - storage under org-assets + work-order-assets (+ other user-assets)
 *
 * Prerequisites:
 *   - server/.env has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - At least one profiles.role = 'super_admin' row exists
 *
 * Usage (from repo root):
 *   CONFIRM=DELETE_ALL_EXCEPT_ADMIN npm run wipe:keep-admin --prefix server
 *
 * Or:
 *   CONFIRM=DELETE_ALL_EXCEPT_ADMIN node server/scripts/wipe-keep-admin.js
 *
 * Optional:
 *   ADMIN_EMAIL=you@example.com   # keep only this Super Admin
 *
 * Keep every auth user (still wipes all orgs / app data):
 *   CONFIRM=DELETE_ALL_EXCEPT_ADMIN KEEP_ALL_AUTH=1 node server/scripts/wipe-keep-admin.js
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CONFIRM,
  ADMIN_EMAIL,
  KEEP_ALL_AUTH,
} = process.env

const keepAllAuth = String(KEEP_ALL_AUTH || '').trim() === '1'

if (CONFIRM !== 'DELETE_ALL_EXCEPT_ADMIN') {
  console.error(
    'Refusing to run. Set CONFIRM=DELETE_ALL_EXCEPT_ADMIN to proceed.\n\n' +
      'Fresh start (keep Super Admin login only):\n' +
      '  CONFIRM=DELETE_ALL_EXCEPT_ADMIN npm run wipe:keep-admin --prefix server\n\n' +
      'Keep one Super Admin by email:\n' +
      '  CONFIRM=DELETE_ALL_EXCEPT_ADMIN ADMIN_EMAIL=you@example.com npm run wipe:keep-admin --prefix server\n\n' +
      'Keep ALL auth logins (still deletes every organization):\n' +
      '  CONFIRM=DELETE_ALL_EXCEPT_ADMIN KEEP_ALL_AUTH=1 npm run wipe:keep-admin --prefix server'
  )
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const STORAGE_BUCKETS = ['org-assets', 'work-order-assets', 'user-assets']

/**
 * Sibling tables with ON DELETE RESTRICT to departments/locations/areas/statuses.
 * Deleting organizations alone can fail; clear these first.
 */
const RESTRICT_BLOCKERS = [
  'pm_plan_audit',
  'pm_plan_technicians',
  'pm_plans',
  'work_request_timeline',
  'work_requests',
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

async function getAdminProfiles() {
  let query = supabase
    .from('profiles')
    .select('id, email, role, org_id')
    .eq('role', 'super_admin')

  if (ADMIN_EMAIL?.trim()) {
    query = query.ilike('email', ADMIN_EMAIL.trim())
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function getAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, org_id')
  if (error) throw error
  return data || []
}

async function detachProfiles(ids) {
  if (!ids.length) return
  const { error } = await supabase
    .from('profiles')
    .update({ org_id: null })
    .in('id', ids)
  if (error) throw error
}

async function deleteAllRows(table) {
  const { data, error: listError } = await supabase.from(table).select('id')
  if (listError) {
    // Table may not exist in older DBs
    if (/does not exist|Could not find the table/i.test(listError.message)) {
      console.log(`  skip ${table}: not present`)
      return 0
    }
    throw listError
  }

  const ids = (data || []).map((row) => row.id)
  if (!ids.length) return 0

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { error } = await supabase.from(table).delete().in('id', chunk)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  return ids.length
}

async function clearRestrictBlockers() {
  let total = 0
  for (const table of RESTRICT_BLOCKERS) {
    const count = await deleteAllRows(table)
    if (count) console.log(`  ${table}: ${count}`)
    total += count
  }
  return total
}

async function deleteAllOrganizations() {
  const { data, error: listError } = await supabase
    .from('organizations')
    .select('id, name, slug')
  if (listError) throw listError

  const rows = data || []
  if (!rows.length) return 0

  const chunkSize = 50
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase
      .from('organizations')
      .delete()
      .in('id', chunk.map((row) => row.id))
    if (error) throw error
    for (const row of chunk) {
      console.log(`  deleted org: ${row.slug || row.name || row.id}`)
    }
  }
  return rows.length
}

async function deleteNonAdminProfiles(keepIds) {
  const { data, error: listError } = await supabase
    .from('profiles')
    .select('id, email, role')
  if (listError) throw listError

  const keep = new Set(keepIds)
  const victims = (data || []).filter((row) => !keep.has(row.id))
  if (!victims.length) return 0

  for (const row of victims) {
    const { error } = await supabase.from('profiles').delete().eq('id', row.id)
    if (error) throw error
    console.log(`  deleted profile: ${row.email || row.id} (${row.role})`)
  }
  return victims.length
}

async function deleteNonAdminAuthUsers(keepIds) {
  const keep = new Set(keepIds)
  let deleted = 0
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    if (!data.users.length) break

    for (const user of data.users) {
      if (keep.has(user.id)) {
        console.log(`  kept auth user: ${user.email || user.id}`)
        continue
      }
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id)
      if (delError) throw delError
      console.log(`  deleted auth user: ${user.email || user.id}`)
      deleted++
    }

    if (data.users.length < 100) break
    page++
  }

  return deleted
}

async function listAllFiles(bucket, prefix = '') {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  })
  if (error) {
    if (/not found|does not exist/i.test(error.message)) return []
    throw error
  }

  const paths = []
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id == null && !entry.metadata) {
      paths.push(...(await listAllFiles(bucket, path)))
    } else {
      paths.push(path)
    }
  }
  return paths
}

async function wipeStorage(keepUserIds) {
  const keepFolders = new Set(keepUserIds)

  for (const bucket of STORAGE_BUCKETS) {
    console.log(`  scanning bucket: ${bucket}`)
    let paths
    try {
      paths = await listAllFiles(bucket)
    } catch (err) {
      console.warn(`  skip ${bucket}: ${err.message}`)
      continue
    }

    const toDelete = paths.filter((path) => {
      if (bucket !== 'user-assets') return true
      const folder = path.split('/')[0]
      return !keepFolders.has(folder)
    })

    if (!toDelete.length) {
      console.log(`  ${bucket}: nothing to delete`)
      continue
    }

    const chunkSize = 100
    for (let i = 0; i < toDelete.length; i += chunkSize) {
      const chunk = toDelete.slice(i, i + chunkSize)
      const { error } = await supabase.storage.from(bucket).remove(chunk)
      if (error) throw error
    }
    console.log(`  ${bucket}: deleted ${toDelete.length} object(s)`)
  }
}

async function main() {
  console.log('=== MMS PRO — Fresh start wipe (keep login auth) ===\n')
  console.log(keepAllAuth
    ? 'Mode: KEEP_ALL_AUTH — keep every auth user + profile; delete all orgs/app data.'
    : 'Mode: Super Admin only — keep super_admin login(s); delete other users + all orgs.')

  const admins = await getAdminProfiles()
  if (!admins.length) {
    throw new Error(
      ADMIN_EMAIL
        ? `No Super Admin found with email "${ADMIN_EMAIL}" (role must be 'super_admin').`
        : "No Super Admin profiles found (profiles.role = 'super_admin'). Aborting."
    )
  }

  console.log('\nSuper Admin profile(s):')
  for (const admin of admins) {
    console.log(`  - ${admin.email || admin.id}`)
  }

  const keepIds = keepAllAuth
    ? (await getAllProfiles()).map((row) => row.id)
    : admins.map((a) => a.id)

  if (keepAllAuth) {
    console.log(`\nKeeping ${keepIds.length} profile(s) / auth user(s).`)
  }

  console.log('\nStep 1: Detach kept profiles from organizations...')
  await detachProfiles(keepIds)

  console.log('\nStep 2: Clear RESTRICT-linked rows (PM / WR / equipment / tasks)...')
  const blockerCount = await clearRestrictBlockers()
  console.log(`  ${blockerCount} row(s) cleared from blocker tables`)

  console.log('\nStep 3: Delete all organizations (cascades remaining org data)...')
  const orgCount = await deleteAllOrganizations()
  console.log(`  ${orgCount} organization(s) deleted`)

  if (!keepAllAuth) {
    console.log('\nStep 4: Delete non-admin profiles...')
    const profileCount = await deleteNonAdminProfiles(keepIds)
    console.log(`  ${profileCount} profile(s) deleted`)

    console.log('\nStep 5: Delete non-admin auth users...')
    const userCount = await deleteNonAdminAuthUsers(keepIds)
    console.log(`  ${userCount} auth user(s) deleted`)
  } else {
    console.log('\nStep 4–5: Skipped (KEEP_ALL_AUTH=1) — auth users/profiles retained.')
  }

  console.log('\nStep 6: Wipe storage buckets...')
  await wipeStorage(keepIds)

  console.log('\nDone. Database is fresh.')
  console.log('Sign in with your Super Admin account → /admin → create a new organization.')
}

main().catch((err) => {
  console.error('\nWipe failed:', err.message)
  process.exit(1)
})
