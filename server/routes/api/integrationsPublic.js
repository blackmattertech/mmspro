import { Router } from 'express'
import { publicFirebaseWebConfig } from '../../lib/platformIntegrations.js'

const router = Router()

router.get('/firebase-web', async (_req, res) => {
  try {
    res.json(await publicFirebaseWebConfig())
  } catch (error) {
    console.warn('Firebase web config failed:', error.message)
    res.json({ configured: false })
  }
})

router.get('/firebase-messaging-config.js', async (_req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8')
  res.set('Cache-Control', 'no-store')
  try {
    const config = await publicFirebaseWebConfig()
    res.send(`self.__MMSPRO_FIREBASE__=${JSON.stringify(config).replace(/</g, '\\u003c')};`)
  } catch (error) {
    console.warn('Firebase messaging config failed:', error.message)
    res.send('self.__MMSPRO_FIREBASE__={"configured":false};')
  }
})

export default router
