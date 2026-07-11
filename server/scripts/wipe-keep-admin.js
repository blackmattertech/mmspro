/**
 * Deletes all MMS PRO data except platform admin profile(s).
 *
 * Keeps:
 *   - auth users whose profiles.role = 'super_admin'
 *   - those profile rows (org_id cleared)
 *   - optional: their user-assets/{user_id}/ files
 *
 * Deletes:
 *   - all organizations (cascades locations, employees, roles, work orders, etc.)
 *   - all non-admin profiles
 *   - all non-admin auth users
 *   - storage under org-assets + work-order-assets
 *   - other user-assets folders
 *
 * Prerequisites:
 *   - server/.env has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage (from repo root or server/):
 *   CONFIRM=DELETE_ALL_EXCEPT_ADMIN node server/scripts/wipe-keep-admin.js
 *
 * Optional:
 *   ADMIN_EMAIL=you@example.com   # keep only this admin (must already be role=admin)
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CONFIRM, ADMIN_EMAIL } = process.env

if (CONFIRM !== 'DELETE_ALL_EXCEPT_ADMIN') {
  console.error(
    'Refusing to run. Set CONFIRM=DELETE_ALL_EXCEPT_ADMIN to proceed.\n\n' +
      'Example:\n' +
      '  CONFIRM=DELETE_ALL_EXCEPT_ADMIN node server/scripts/wipe-keep-admin.js\n' +
      '  CONFIRM=DELETE_ALL_EXCEPT_ADMIN ADMIN_EMAIL=you@example.com node server/scripts/wipe-keep-admin.js'
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

async function detachAdmins(adminIds) {
  if (!adminIds.length) return
  const { error } = await supabase
    .from('profiles')
    .update({ org_id: null })
    .in('id', adminIds)
  if (error) throw error
}

async function deleteAllOrganizations() {
  const { data, error: listError } = await supabase
    .from('organizations')
    .select('id')
  if (listError) throw listError

  const ids = (data || []).map((row) => row.id)
  if (!ids.length) return 0

  // Chunk deletes to avoid oversized requests
  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { error } = await supabase.from('organizations').delete().in('id', chunk)
    if (error) throw error
  }
  return ids.length
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
    // Bucket may not exist yet
    if (/not found|does not exist/i.test(error.message)) return []
    throw error
  }

  const paths = []
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    // Folders often have null id / no metadata in list responses
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
  console.log('=== MMS PRO — Wipe all except platform admin ===\n')

  const admins = await getAdminProfiles()
  if (!admins.length) {
    throw new Error(
      ADMIN_EMAIL
        ? `No Super Admin found with email "${ADMIN_EMAIL}" (role must be 'super_admin').`
        : "No Super Admin profiles found (profiles.role = 'super_admin'). Aborting."
    )
  }

  console.log('Keeping admin profile(s):')
  for (const admin of admins) {
    console.log(`  - ${admin.email || admin.id}`)
  }

  const keepIds = admins.map((a) => a.id)

  console.log('\nStep 1: Detach admins from organizations...')
  await detachAdmins(keepIds)

  console.log('\nStep 2: Delete all organizations (cascades org data)...')
  const orgCount = await deleteAllOrganizations()
  console.log(`  ${orgCount} organization(s) deleted`)

  console.log('\nStep 3: Delete non-admin profiles...')
  const profileCount = await deleteNonAdminProfiles(keepIds)
  console.log(`  ${profileCount} profile(s) deleted`)

  console.log('\nStep 4: Delete non-admin auth users...')
  const userCount = await deleteNonAdminAuthUsers(keepIds)
  console.log(`  ${userCount} auth user(s) deleted`)

  console.log('\nStep 5: Wipe storage buckets...')
  await wipeStorage(keepIds)

  console.log('\nDone. Platform admin account(s) retained; all orgs and other users removed.')
  console.log('Sign in with the admin account to use /admin.')
}

main().catch((err) => {
  console.error('\nWipe failed:', err.message)
  process.exit(1)
})
