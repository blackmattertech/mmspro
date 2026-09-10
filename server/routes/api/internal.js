import { Router } from 'express'
import { runAllSchedulerJobs } from '../../lib/taskScheduler.js'

const router = Router()

/**
 * External cron entrypoint for serverless / split workers.
 * Header: x-internal-jobs-secret: <INTERNAL_JOBS_SECRET>
 */
router.post('/run-jobs', async (req, res) => {
  const secret = process.env.INTERNAL_JOBS_SECRET?.trim()
  if (!secret) {
    return res.status(503).json({ error: 'INTERNAL_JOBS_SECRET is not configured' })
  }

  const provided = req.get('x-internal-jobs-secret') || req.query.secret
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await runAllSchedulerJobs()
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
