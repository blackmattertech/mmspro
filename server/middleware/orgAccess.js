import { supabaseAdmin } from '../services/supabase.js'
import { profileCache } from '../lib/requestCache.js'
import { ACCOUNT_ROLES } from '../lib/accountRoles.js'

function allowsWithoutOrg(profile) {
  return profile?.role === ACCOUNT_ROLES.SUPER_ADMIN
}

/**
 * Attaches req.userProfile (with org_id + role) to every request.
 * Always run this after verifyAuth.
 * Super Admins may have no org_id (platform /admin panel).
 */
export const requireOrgAccess = async (req, res, next) => {
  const userId = req.user.id
  const cached = profileCache.get(userId)
  if (cached) {
    if (!cached.org_id && !allowsWithoutOrg(cached)) {
      return res.status(403).json({ error: 'No org access' })
    }
    req.userProfile = cached
    return next()
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, org_id, role, email')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    return res.status(403).json({ error: 'No org access' })
  }

  if (!profile.org_id && !allowsWithoutOrg(profile)) {
    return res.status(403).json({ error: 'No org access' })
  }

  profileCache.set(userId, profile)
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
