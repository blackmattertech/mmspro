import { Router } from 'express'
import { verifyAuth } from '../../middleware/auth.js'

const router = Router()

router.get('/me', verifyAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
