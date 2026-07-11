import { supabaseAdmin } from '../services/supabase.js'
import { ACCOUNT_ROLES } from '../lib/accountRoles.js'

export const adminOnly = async (req, res, next) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single()

  if (profile?.role !== ACCOUNT_ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Super Admin access required' })
  }
  next()
}
