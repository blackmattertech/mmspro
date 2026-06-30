import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { adminOnly } from '../../middleware/adminOnly.js'
import { supabaseAdmin } from '../../services/supabase.js'

const router = Router()
router.use(verifyAuth, adminOnly)

router.get('/users', async (req, res) => {
  const { data, error } = await supabaseAdmin.from('profiles').select('*')
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
