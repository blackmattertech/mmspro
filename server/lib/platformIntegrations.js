import { supabaseAdmin } from '../services/supabase.js'

const PROVIDERS = ['email', 'firebase', 'cashfree']
const CACHE_MS = 15_000

let cache = { at: 0, rows: null, missing: false }

function clean(value) {
  const text = String(value ?? '').trim()
  if (!text || /^your_/i.test(text)) return ''
  return text
}

export function maskSecret(value) {
  const text = clean(value)
  if (!text) return ''
  if (text.length <= 4) return '••••'
  return `••••${text.slice(-4)}`
}

export function isMissingIntegrationsTable(error) {
  const message = String(error?.message || error?.code || '')
  return /platform_integrations|PGRST205|schema cache|does not exist/i.test(message)
}

function envEmail() {
  const apiKey = clean(process.env.MAILJET_API_KEY)
  const secretKey = clean(process.env.MAILJET_SECRET_KEY)
  const fromEmail = clean(process.env.MAILJET_FROM_EMAIL)
  if (!apiKey || !secretKey || !fromEmail) return null
  return {
    apiKey,
    secretKey,
    fromEmail,
    fromName: clean(process.env.MAILJET_FROM_NAME) || 'MMS PRO',
  }
}

function envFirebaseWeb() {
  return {
    apiKey: clean(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY),
    authDomain: clean(process.env.FIREBASE_WEB_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: clean(process.env.FIREBASE_WEB_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: clean(process.env.FIREBASE_WEB_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: clean(process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: clean(process.env.FIREBASE_WEB_APP_ID || process.env.VITE_FIREBASE_APP_ID),
    measurementId: clean(process.env.FIREBASE_WEB_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID),
    vapidKey: clean(process.env.FIREBASE_WEB_VAPID_KEY || process.env.VITE_FIREBASE_VAPID_KEY),
  }
}

function envFirebaseAdmin() {
  const rawJson = clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  if (rawJson) {
    try {
      return JSON.parse(rawJson)
    } catch {
      return null
    }
  }
  return null
}

function envCashfree() {
  const appId = clean(process.env.CASHFREE_APP_ID)
  const secretKey = clean(process.env.CASHFREE_SECRET_KEY)
  if (!appId || !secretKey) return null
  const environment = clean(process.env.CASHFREE_ENV).toLowerCase() === 'production' ? 'production' : 'sandbox'
  return { appId, secretKey, environment }
}

export function invalidateIntegrationCache() {
  cache = { at: 0, rows: null, missing: false }
}

async function loadRows() {
  if (cache.rows && Date.now() - cache.at < CACHE_MS) return cache
  const { data, error } = await supabaseAdmin
    .from('platform_integrations')
    .select('provider, enabled, config')
  if (error) {
    if (isMissingIntegrationsTable(error)) {
      cache = { at: Date.now(), rows: [], missing: true }
      return cache
    }
    throw error
  }
  cache = { at: Date.now(), rows: data || [], missing: false }
  return cache
}

function findRow(rows, provider) {
  return (rows || []).find((row) => row.provider === provider) || null
}

export async function getIntegrationRow(provider) {
  const loaded = await loadRows()
  return { row: findRow(loaded.rows, provider), missing: loaded.missing }
}

export async function resolveEmailConfig() {
  const { row } = await getIntegrationRow('email')
  if (row) {
    if (!row.enabled) return null
    const config = row.config || {}
    if (!clean(config.apiKey) || !clean(config.secretKey) || !clean(config.fromEmail)) return null
    return {
      apiKey: clean(config.apiKey),
      secretKey: clean(config.secretKey),
      fromEmail: clean(config.fromEmail),
      fromName: clean(config.fromName) || 'MMS PRO',
    }
  }
  return envEmail()
}

export async function resolveFirebaseConfig() {
  const { row } = await getIntegrationRow('firebase')
  const webFromEnv = envFirebaseWeb()
  if (row) {
    if (!row.enabled) return null
    const config = row.config || {}
    let serviceAccount = null
    if (config.serviceAccount && typeof config.serviceAccount === 'object') {
      serviceAccount = config.serviceAccount
    } else if (clean(config.serviceAccountJson)) {
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson)
      } catch {
        serviceAccount = null
      }
    }
    return {
      apiKey: clean(config.apiKey) || webFromEnv.apiKey,
      authDomain: clean(config.authDomain) || webFromEnv.authDomain,
      projectId: clean(config.projectId) || webFromEnv.projectId,
      storageBucket: clean(config.storageBucket) || webFromEnv.storageBucket,
      messagingSenderId: clean(config.messagingSenderId) || webFromEnv.messagingSenderId,
      appId: clean(config.appId) || webFromEnv.appId,
      measurementId: clean(config.measurementId) || webFromEnv.measurementId,
      vapidKey: clean(config.vapidKey) || webFromEnv.vapidKey,
      serviceAccount: serviceAccount || envFirebaseAdmin(),
    }
  }
  const serviceAccount = envFirebaseAdmin()
  const hasWeb = webFromEnv.apiKey && webFromEnv.projectId && webFromEnv.appId
  if (!serviceAccount && !hasWeb) return null
  return { ...webFromEnv, serviceAccount }
}

export async function resolveCashfreeConfig() {
  const { row } = await getIntegrationRow('cashfree')
  if (row) {
    if (!row.enabled) return null
    const config = row.config || {}
    if (!clean(config.appId) || !clean(config.secretKey)) return null
    return {
      appId: clean(config.appId),
      secretKey: clean(config.secretKey),
      environment: config.environment === 'production' ? 'production' : 'sandbox',
    }
  }
  return envCashfree()
}

function publicFirebase(config) {
  if (!config?.apiKey || !config.projectId || !config.appId) return { configured: false }
  return {
    configured: true,
    apiKey: config.apiKey,
    authDomain: config.authDomain || '',
    projectId: config.projectId,
    storageBucket: config.storageBucket || '',
    messagingSenderId: config.messagingSenderId || '',
    appId: config.appId,
    measurementId: config.measurementId || '',
    vapidKey: config.vapidKey || '',
  }
}

export async function publicFirebaseWebConfig() {
  const { row } = await getIntegrationRow('firebase')
  if (row && !row.enabled) return { configured: false, disabled: true }
  return publicFirebase(await resolveFirebaseConfig())
}

function sourceFor(row, envValue) {
  if (row) return 'database'
  if (envValue) return 'environment'
  return 'none'
}

export async function integrationStatus() {
  const loaded = await loadRows()
  const emailRow = findRow(loaded.rows, 'email')
  const firebaseRow = findRow(loaded.rows, 'firebase')
  const cashfreeRow = findRow(loaded.rows, 'cashfree')
  const emailEnv = envEmail()
  const firebase = await resolveFirebaseConfig()
  const cashfreeEnv = envCashfree()
  const emailConfig = emailRow?.config || {}
  const firebaseConfig = firebaseRow?.config || {}
  const cashfreeConfig = cashfreeRow?.config || {}

  return {
    tableReady: !loaded.missing,
    email: {
      enabled: emailRow ? Boolean(emailRow.enabled) : Boolean(emailEnv),
      source: sourceFor(emailRow, emailEnv),
      fromEmail: emailRow ? clean(emailConfig.fromEmail) : (emailEnv?.fromEmail || ''),
      fromName: emailRow ? (clean(emailConfig.fromName) || 'MMS PRO') : (emailEnv?.fromName || 'MMS PRO'),
      apiKeySet: Boolean(emailRow ? clean(emailConfig.apiKey) : emailEnv?.apiKey),
      secretKeySet: Boolean(emailRow ? clean(emailConfig.secretKey) : emailEnv?.secretKey),
      apiKeyHint: maskSecret(emailRow ? emailConfig.apiKey : emailEnv?.apiKey),
      secretKeyHint: maskSecret(emailRow ? emailConfig.secretKey : emailEnv?.secretKey),
    },
    firebase: {
      enabled: firebaseRow ? Boolean(firebaseRow.enabled) : Boolean(firebase),
      source: sourceFor(firebaseRow, firebase),
      apiKey: firebaseRow ? clean(firebaseConfig.apiKey) : (firebase?.apiKey || ''),
      authDomain: firebaseRow ? clean(firebaseConfig.authDomain) : (firebase?.authDomain || ''),
      projectId: firebaseRow ? clean(firebaseConfig.projectId) : (firebase?.projectId || ''),
      storageBucket: firebaseRow ? clean(firebaseConfig.storageBucket) : (firebase?.storageBucket || ''),
      messagingSenderId: firebaseRow ? clean(firebaseConfig.messagingSenderId) : (firebase?.messagingSenderId || ''),
      appId: firebaseRow ? clean(firebaseConfig.appId) : (firebase?.appId || ''),
      measurementId: firebaseRow ? clean(firebaseConfig.measurementId) : (firebase?.measurementId || ''),
      vapidKeySet: Boolean(firebaseRow ? clean(firebaseConfig.vapidKey) : firebase?.vapidKey),
      vapidKeyHint: maskSecret(firebaseRow ? firebaseConfig.vapidKey : firebase?.vapidKey),
      serviceAccountSet: Boolean(
        firebaseRow
          ? (firebaseConfig.serviceAccount || clean(firebaseConfig.serviceAccountJson))
          : firebase?.serviceAccount,
      ),
    },
    cashfree: {
      enabled: cashfreeRow ? Boolean(cashfreeRow.enabled) : Boolean(cashfreeEnv),
      source: sourceFor(cashfreeRow, cashfreeEnv),
      environment: cashfreeRow
        ? (cashfreeConfig.environment === 'production' ? 'production' : 'sandbox')
        : (cashfreeEnv?.environment || 'sandbox'),
      appId: cashfreeRow ? clean(cashfreeConfig.appId) : (cashfreeEnv?.appId || ''),
      secretKeySet: Boolean(cashfreeRow ? clean(cashfreeConfig.secretKey) : cashfreeEnv?.secretKey),
      secretKeyHint: maskSecret(cashfreeRow ? cashfreeConfig.secretKey : cashfreeEnv?.secretKey),
    },
  }
}

function keepSecret(nextValue, previous) {
  const text = String(nextValue ?? '').trim()
  if (!text || text.startsWith('••••')) return clean(previous)
  return text
}

export async function saveIntegration(provider, body = {}) {
  if (!PROVIDERS.includes(provider)) {
    const error = new Error('Unknown integration')
    error.status = 400
    throw error
  }
  const { row, missing } = await getIntegrationRow(provider)
  if (missing) {
    const error = new Error('Apply supabase-patches/84-platform-integrations.sql before saving integrations.')
    error.status = 503
    throw error
  }
  const previous = row?.config || {}
  let config = {}
  if (provider === 'email') {
    config = {
      apiKey: keepSecret(body.apiKey, previous.apiKey),
      secretKey: keepSecret(body.secretKey, previous.secretKey),
      fromEmail: clean(body.fromEmail),
      fromName: clean(body.fromName) || 'MMS PRO',
    }
  } else if (provider === 'firebase') {
    let serviceAccount = previous.serviceAccount || null
    const raw = String(body.serviceAccountJson ?? '').trim()
    if (raw && !raw.startsWith('••••')) {
      try {
        serviceAccount = JSON.parse(raw)
      } catch {
        const error = new Error('Firebase service account must be valid JSON.')
        error.status = 400
        throw error
      }
      if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
        const error = new Error('Service account JSON needs project_id, client_email, and private_key.')
        error.status = 400
        throw error
      }
    }
    config = {
      apiKey: clean(body.apiKey),
      authDomain: clean(body.authDomain),
      projectId: clean(body.projectId),
      storageBucket: clean(body.storageBucket),
      messagingSenderId: clean(body.messagingSenderId),
      appId: clean(body.appId),
      measurementId: clean(body.measurementId),
      vapidKey: keepSecret(body.vapidKey, previous.vapidKey),
      serviceAccount,
    }
  } else {
    config = {
      appId: clean(body.appId),
      secretKey: keepSecret(body.secretKey, previous.secretKey),
      environment: body.environment === 'production' ? 'production' : 'sandbox',
    }
  }

  const payload = {
    provider,
    enabled: Boolean(body.enabled),
    config,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin
    .from('platform_integrations')
    .upsert(payload, { onConflict: 'provider' })
  if (error) {
    if (isMissingIntegrationsTable(error)) {
      const missingError = new Error('Apply supabase-patches/84-platform-integrations.sql before saving integrations.')
      missingError.status = 503
      throw missingError
    }
    throw error
  }
  invalidateIntegrationCache()
  return integrationStatus()
}
