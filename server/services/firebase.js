import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'
import { getIntegrationRow, resolveFirebaseConfig } from '../lib/platformIntegrations.js'

const isPlaceholder = (value) => !value || /^your_/i.test(value)

function serviceAccountFromFile() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (!jsonPath || isPlaceholder(jsonPath)) return null
  try {
    return JSON.parse(readFileSync(resolve(jsonPath), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(
        `FIREBASE_SERVICE_ACCOUNT_PATH file not found (${jsonPath}). ` +
        'Save the service account JSON from Super Admin → Integrations, or set FIREBASE_SERVICE_ACCOUNT_JSON.',
      )
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_PATH read failed:', error.message)
    }
    return null
  }
}

let messaging = null
let messagingKey = ''

export async function getFirebaseMessaging() {
  const { row } = await getIntegrationRow('firebase')
  if (row && !row.enabled) return null
  const config = await resolveFirebaseConfig()
  const serviceAccount = config?.serviceAccount || serviceAccountFromFile()
  if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    return null
  }
  const key = `${serviceAccount.project_id}:${serviceAccount.client_email}`
  if (messaging && messagingKey === key) return messaging
  try {
    const existing = admin.apps.find((app) => app.name === 'mmspro')
    if (existing) await existing.delete()
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    }, 'mmspro')
    messaging = app.messaging()
    messagingKey = key
    return messaging
  } catch (error) {
    console.warn('Firebase Admin failed to initialize:', error.message)
    messaging = null
    messagingKey = ''
    return null
  }
}

export async function isFirebaseAdminConfigured() {
  return Boolean(await getFirebaseMessaging())
}
