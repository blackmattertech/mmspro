import { supabaseAdmin } from '../services/supabase.js'
import { ensureUserProfile } from './profiles.js'
import { generateOrgSlug, ensureUniqueSlug } from './slug.js'

/**
 * Creates an organization and links the user as owner.
 * Uses direct Supabase calls (no RPC) so it works even if SQL functions are outdated.
 */
export async function createOrgForUser(userId, email, orgName, orgSlugInput) {
  const existingOrgId = await ensureUserProfile(userId, email)
  if (existingOrgId) {
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id, slug')
      .eq('id', existingOrgId)
      .maybeSingle()

    if (existingOrg) {
      return { orgId: existingOrg.id, orgSlug: existingOrg.slug }
    }

    // Orphaned org_id — clear and allow a fresh workspace
    await supabaseAdmin
      .from('profiles')
      .update({ org_id: null, role: 'member' })
      .eq('id', userId)
  }

  const baseSlug = orgSlugInput?.trim() || generateOrgSlug(orgName)
  const orgSlug = await ensureUniqueSlug(baseSlug)

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name: orgName.trim(), slug: orgSlug })
    .select('id')
    .single()

  if (orgError) {
    const err = new Error(orgError.message)
    err.status = 500
    throw err
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      { id: userId, email, org_id: org.id, role: 'owner' },
      { onConflict: 'id' }
    )

  if (profileError) {
    await supabaseAdmin.from('organizations').delete().eq('id', org.id)
    const err = new Error(profileError.message)
    err.status = 500
    throw err
  }

  return { orgId: org.id, orgSlug }
}
