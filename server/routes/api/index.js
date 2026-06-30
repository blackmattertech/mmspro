import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'

const router = Router()
router.use(verifyAuth)

router.get('/me', (req, res) => {
  res.json({ user: req.user })
})

export default router
