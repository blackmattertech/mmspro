const isPlaceholder = (value) => !value || /^your_/i.test(value)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const isFirebaseConfigured =
  Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  ) &&
  !isPlaceholder(firebaseConfig.apiKey) &&
  !isPlaceholder(firebaseConfig.projectId)

let app = null
let messaging = null
let analyticsInitStarted = false
let appInflight = null
let messagingInflight = null
let serviceWorkerRegistration = null
let messagingModulePromise = null

const getFirebaseApp = async () => {
  const config = await activeFirebaseConfig()
  if (!config || typeof window === 'undefined') return null
  if (app) return app
  if (!appInflight) {
    appInflight = import('firebase/app').then(({ initializeApp, getApps }) => {
      app = getApps().length ? getApps()[0] : initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
        measurementId: config.measurementId,
      })
      return app
    })
  }
  return appInflight
}

function loadMessagingModule() {
  if (!messagingModulePromise) {
    messagingModulePromise = import('firebase/messaging')
  }
  return messagingModulePromise
}

export const initAnalytics = async () => {
  const config = await activeFirebaseConfig()
  if (!config || analyticsInitStarted || typeof window === 'undefined') return null
  analyticsInitStarted = true

  if (!config.measurementId || isPlaceholder(config.measurementId)) return null

  const { getAnalytics, isSupported } = await import('firebase/analytics')
  const supported = await isSupported()
  if (!supported) return null

  const firebaseApp = await getFirebaseApp()
  if (!firebaseApp) return null

  return getAnalytics(firebaseApp)
}

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null
  if (serviceWorkerRegistration) return serviceWorkerRegistration
  serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
  })
  return serviceWorkerRegistration
}

export const initMessaging = async () => {
  const config = await activeFirebaseConfig()
  if (!config || typeof window === 'undefined') return null
  if (messaging) return messaging
  if (messagingInflight) return messagingInflight

  messagingInflight = (async () => {
    const { getMessaging, isSupported } = await loadMessagingModule()
    const supported = await isSupported()
    if (!supported) return null

    const firebaseApp = await getFirebaseApp()
    if (!firebaseApp) return null

    const registration = await registerServiceWorker()
    if (registration) await registration.ready
    else await navigator.serviceWorker.ready

    messaging = getMessaging(firebaseApp)
    return messaging
  })()

  try {
    return await messagingInflight
  } finally {
    messagingInflight = null
  }
}

/** Warm Firebase messaging + SW while the permission dialog is open. */
export const prefetchMessaging = () => {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return ensureFirebaseConfig()
    .then((status) => {
      if (!status?.configured) return null
      loadMessagingModule()
      return initMessaging()
    })
    .catch(() => null)
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
export const isVapidConfigured = Boolean(vapidKey) && !isPlaceholder(vapidKey)

let remoteConfig = null
let remotePromise = null

function apiOrigin() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  // Dev: Vite proxies /api. Production builds require VITE_API_URL (enforced in vite.config).
  if (import.meta.env.DEV && typeof window !== 'undefined') return window.location.origin
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function ensureFirebaseConfig() {
  if (typeof window === 'undefined') {
    return Promise.resolve({ configured: isFirebaseConfigured, vapidConfigured: isVapidConfigured })
  }
  if (!remotePromise) {
    const url = `${apiOrigin()}/api/integrations/firebase-web`
    const headers = /ngrok/i.test(window.location.hostname) ? { 'ngrok-skip-browser-warning': '1' } : {}
    remotePromise = fetch(url, { headers })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        remoteConfig = data
        if (data?.disabled) return { configured: false, vapidConfigured: false }
        if (data?.configured) {
          return {
            configured: true,
            vapidConfigured: Boolean(data.vapidKey) && !isPlaceholder(data.vapidKey),
          }
        }
        return { configured: isFirebaseConfigured, vapidConfigured: isVapidConfigured }
      })
      .catch(() => ({ configured: isFirebaseConfigured, vapidConfigured: isVapidConfigured }))
  }
  return remotePromise
}

async function activeFirebaseConfig() {
  await ensureFirebaseConfig()
  if (remoteConfig?.disabled) return null
  if (remoteConfig?.configured && remoteConfig.apiKey && remoteConfig.projectId && remoteConfig.appId) {
    return remoteConfig
  }
  return isFirebaseConfigured ? firebaseConfig : null
}

async function activeVapidKey() {
  const config = await activeFirebaseConfig()
  const key = config?.vapidKey || vapidKey
  return key && !isPlaceholder(key) ? key : ''
}

export const requestNotificationPermission = async () => {
  if (typeof Notification === 'undefined') return null
  // Ask before service-worker setup. Browsers drop the prompt if it is not
  // started in the same tap that triggered this call.
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return null

  const messagingInstance = await initMessaging()
  if (!messagingInstance) return null

  const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready
  const { getToken } = await loadMessagingModule()
  const options = { serviceWorkerRegistration: registration }
  const key = await activeVapidKey()
  if (key) options.vapidKey = key

  return getToken(messagingInstance, options)
}

export const onForegroundMessage = (callback) => {
  let unsubscribe = () => {}
  initMessaging().then(async (instance) => {
    if (!instance) return
    const { onMessage } = await loadMessagingModule()
    unsubscribe = onMessage(instance, callback)
  })
  return () => unsubscribe()
}
