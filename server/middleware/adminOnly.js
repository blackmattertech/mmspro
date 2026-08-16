import { supabaseAdmin } from '../services/supabase.js'
import { ACCOUNT_ROLES } from '../lib/accountRoles.js'
import { profileCache } from '../lib/requestCache.js'

export const adminOnly = async (req, res, next) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let profile = profileCache.get(userId)
  if (!profile) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !data) {
      return res.status(403).json({ error: 'Super Admin access required' })
    }

    profile = data
    profileCache.set(userId, profile)
  }

  if (profile?.role !== ACCOUNT_ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Super Admin access required' })
  }
  next()
}
