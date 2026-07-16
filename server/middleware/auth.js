import { supabaseAdmin } from '../services/supabase.js'
import { authUserCache, hashToken } from '../lib/requestCache.js'

export const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })

  const cacheKey = hashToken(token)
  const cached = authUserCache.get(cacheKey)
  if (cached) {
    req.user = cached
    return next()
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  authUserCache.set(cacheKey, user)
  req.user = user
  next()
}
