import { Router } from 'express'
import { sendEmail } from '../../services/email.js'
import { getFirebaseMessaging } from '../../services/firebase.js'
import { verifyCashfree } from '../../services/cashfree.js'
import { integrationStatus, saveIntegration } from '../../lib/platformIntegrations.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    res.json(await integrationStatus())
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load integrations' })
  }
})

router.put('/:provider', async (req, res) => {
  try {
    res.json(await saveIntegration(req.params.provider, req.body || {}))
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not save integration' })
  }
})

router.post('/email/test', async (req, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim()
  if (!to) return res.status(400).json({ error: 'Enter an email address for the test.' })
  try {
    const result = await sendEmail({
      to,
      subject: 'MMS PRO email test',
      htmlContent: '<p>Email integration is working.</p>',
      textContent: 'Email integration is working.',
    })
    if (!result) return res.status(400).json({ error: 'Email is not configured, or Mailjet rejected the message.' })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Test email failed' })
  }
})

router.post('/firebase/test', async (_req, res) => {
  try {
    const messaging = await getFirebaseMessaging()
    if (!messaging) return res.status(400).json({ error: 'Firebase Admin is not configured.' })
    const app = messaging.app
    if (app?.options?.credential?.getAccessToken) {
      await app.options.credential.getAccessToken()
    }
    res.json({ ok: true })
  } catch (error) {
    res.status(400).json({ error: error.message || 'Firebase check failed' })
  }
})

router.post('/cashfree/test', async (_req, res) => {
  try {
    res.json(await verifyCashfree())
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Cashfree check failed' })
  }
})

export default router
