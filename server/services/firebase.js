import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'

const isPlaceholder = (value) => !value || /^your_/i.test(value)

function loadServiceAccount() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  if (jsonPath && !isPlaceholder(jsonPath)) {
    const absolutePath = resolve(jsonPath)
    return JSON.parse(readFileSync(absolutePath, 'utf8'))
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson && !isPlaceholder(rawJson)) {
    return JSON.parse(rawJson)
  }

  return null
}

const serviceAccount = loadServiceAccount()

export const isFirebaseAdminConfigured = Boolean(serviceAccount)

let fcm = null

if (isFirebaseAdminConfigured) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    }

    fcm = admin.messaging()
  } catch (error) {
    console.warn('Firebase Admin failed to initialize:', error.message)
  }
}

export { fcm }
