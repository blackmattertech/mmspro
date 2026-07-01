import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { adminOnly } from '../../middleware/adminOnly.js'
import { supabaseAdmin } from '../../services/supabase.js'
import organizationRoutes from './organizations.js'

const router = Router()
router.use(verifyAuth, adminOnly)

router.get('/stats', async (_req, res) => {
  const [orgsRes, usersRes, activeRes] = await Promise.all([
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  if (orgsRes.error) return res.status(500).json({ error: orgsRes.error.message })

  res.json({
    totalOrganizations: orgsRes.count || 0,
    activeOrganizations: activeRes.count || 0,
    totalUsers: usersRes.count || 0,
  })
})

router.use('/organizations', organizationRoutes)

router.get('/users', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, org_id, created_at, organizations(name, slug)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
