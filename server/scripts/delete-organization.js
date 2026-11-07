/**
 * Delete ONE organization and all of its related data.
 *
 * Usage (from repo root):
 *   CONFIRM=DELETE_ORGANIZATION ORG_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
 *     npm run delete:org --prefix server
 *
 * Dry run:
 *   CONFIRM=DELETE_ORGANIZATION ORG_ID=… DRY_RUN=1 npm run delete:org --prefix server
 *
 * Prefer Admin → Organizations → Delete (password confirm) when available.
 */
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deleteOrganizationById } from '../lib/deleteOrganization.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const ORGANIZATION_ID = process.env.ORG_ID?.trim() || ''
const dryRun = String(process.env.DRY_RUN || '').trim() === '1'

if (process.env.CONFIRM !== 'DELETE_ORGANIZATION') {
  console.error(
    'Refusing to run. Set CONFIRM=DELETE_ORGANIZATION to proceed.\n\n' +
      'Example:\n' +
      '  CONFIRM=DELETE_ORGANIZATION ORG_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \\\n' +
      '    npm run delete:org --prefix server\n\n' +
      'Or delete from Admin → Organizations (requires Super Admin password).'
  )
  process.exit(1)
}

if (!ORGANIZATION_ID || !/^[0-9a-f-]{36}$/i.test(ORGANIZATION_ID)) {
  console.error('Pass a valid ORG_ID=… UUID (copy from Admin → Organizations → Edit details).')
  process.exit(1)
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env')
  process.exit(1)
}

async function main() {
  console.log(dryRun
    ? '=== MMS PRO — Delete organization (DRY RUN) ===\n'
    : '=== MMS PRO — Delete organization ===\n')

  const result = await deleteOrganizationById(ORGANIZATION_ID, { dryRun })
  const org = result.organization

  console.log('Target organization:')
  console.log(`  id:    ${org.id}`)
  console.log(`  name:  ${org.name}`)
  console.log(`  slug:  /${org.slug}`)
  console.log(`  email: ${org.email || '—'}`)
  console.log('\nCounts:')
  console.log(`  restrict rows:     ${result.counts.restrictRows}`)
  console.log(`  profiles deleted:  ${result.counts.profilesDeleted}`)
  console.log(`  auth users:        ${result.counts.authUsersDeleted}`)
  console.log(`  storage objects:   ${result.counts.storageObjects}`)
  console.log(`  super_admins kept: ${result.counts.superAdminsDetached}`)
  if (result.deletedEmails.length) {
    console.log('\nDeleted logins:')
    for (const email of result.deletedEmails) console.log(`  - ${email}`)
  }

  console.log(dryRun
    ? '\nDry run complete — nothing was deleted.'
    : `\nDone. "${org.name}" (/${org.slug}) and all related data are gone.`)
}

main().catch((err) => {
  console.error('\nDelete failed:', err.message)
  process.exit(1)
})
