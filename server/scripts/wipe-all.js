/**
 * Wipes all MMS PRO data from Supabase:
 * 1. Deletes every auth user
 * 2. Drops all public tables/functions (via Supabase CLI)
 * 3. Re-applies bootstrap schema (via Supabase CLI)
 *
 * Prerequisites:
 *   - supabase CLI installed and logged in (`supabase login`)
 *   - server/.env has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - Project linked: `supabase link --project-ref <ref>`
 *
 * Usage (from repo root):
 *   node server/scripts/wipe-all.js
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env')
  process.exit(1)
}

const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`)
  }
}

async function deleteAllAuthUsers() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let total = 0
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 })
    if (error) throw error
    if (!data.users.length) break

    for (const user of data.users) {
      const { error: delError } = await supabase.auth.admin.deleteUser(user.id)
      if (delError) throw delError
      console.log(`  deleted user: ${user.email || user.id}`)
      total++
    }
  }

  return total
}

function ensureLinked() {
  const configPath = resolve(ROOT, 'supabase/.temp/project-ref')
  const linkedRef = existsSync(configPath)
    ? readFileSync(configPath, 'utf8').trim()
    : null

  if (linkedRef === projectRef) return

  console.log(`\nLinking to project ${projectRef}...`)
  if (!existsSync(resolve(ROOT, 'supabase/config.toml'))) {
    run('supabase', ['init'])
  }
  run('supabase', ['link', '--project-ref', projectRef])
}

function executeSql(relativePath) {
  console.log(`\nRunning ${relativePath}...`)
  run('supabase', ['db', 'query', '--linked', '--file', relativePath])
}

async function main() {
  console.log('=== MMS PRO — Full Supabase Wipe ===\n')

  console.log('Step 1: Deleting all auth users...')
  const deleted = await deleteAllAuthUsers()
  console.log(`  ${deleted} user(s) deleted`)

  ensureLinked()

  console.log('\nStep 2: Dropping all tables and functions...')
  executeSql('supabase-patches/99-wipe-all.sql')

  console.log('\nStep 3: Applying fresh bootstrap schema...')
  executeSql('supabase-patches/00-bootstrap.sql')

  console.log('\nDone! Database is clean and ready.')
  console.log('\nNext steps:')
  console.log('  1. Sign up a new account via the app or Supabase Auth')
  console.log("  2. Make yourself Super Admin:")
  console.log("     update public.profiles set role = 'super_admin' where email = 'your@email.com';")
}

main().catch((err) => {
  console.error('\nWipe failed:', err.message)
  process.exit(1)
})
