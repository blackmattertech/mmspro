import { supabaseAdmin } from '../services/supabase.js'

/**
 * Attaches req.userProfile (with org_id + role) to every request.
 * Always run this after verifyAuth.
 */
export const requireOrgAccess = async (req, res, next) => {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, role, email')
    .eq('id', req.user.id)
    .single()

  if (error || !profile?.org_id) {
    return res.status(403).json({ error: 'No org access' })
  }

  req.userProfile = profile
  next()
}

/**
 * Verifies that a resource belongs to the user's org before allowing access.
 * Usage: router.get('/projects/:id', verifyAuth, requireOrgAccess, assertOrgOwnership('projects'))
 */
export const assertOrgOwnership = (table) => async (req, res, next) => {
  const { data } = await supabaseAdmin
    .from(table)
    .select('org_id')
    .eq('id', req.params.id)
    .single()

  if (!data || data.org_id !== req.userProfile.org_id) {
    return res.status(404).json({ error: 'Not found' })
  }
  next()
}
