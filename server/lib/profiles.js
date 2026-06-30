import { supabaseAdmin } from '../services/supabase.js'

/**
 * Ensures a profiles row exists for the auth user (signup trigger may be missing).
 * Returns org_id if already linked, otherwise null.
 */
export async function ensureUserProfile(userId, email) {
  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (profile) return profile.org_id

  const { error: insertError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: userId, email })

  if (insertError) throw insertError
  return null
}
