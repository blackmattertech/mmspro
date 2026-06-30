import { supabaseAdmin } from '../services/supabase.js'

export const adminOnly = async (req, res, next) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single()

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
