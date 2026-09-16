import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'
import { requireOrgAccess } from '../../middleware/orgAccess.js'
import { requireOrgRole } from '../../middleware/orgRole.js'
import {
  listTextFieldLimits,
  resetTextFieldLimits,
  updateTextFieldLimits,
} from '../../lib/textFieldLimits.js'

const router = Router()
const requireAdmin = requireOrgRole('admin', 'super_admin', 'owner')

router.use(verifyAuth, requireOrgAccess)

router.get('/', async (req, res) => {
  try {
    const fields = await listTextFieldLimits(req.userProfile.org_id)
    res.json({ fields })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/', requireAdmin, async (req, res) => {
  try {
    const fields = await updateTextFieldLimits(req.userProfile.org_id, req.body || {})
    res.json({ fields })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/reset', requireAdmin, async (req, res) => {
  try {
    const fields = await resetTextFieldLimits(req.userProfile.org_id)
    res.json({ fields })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
