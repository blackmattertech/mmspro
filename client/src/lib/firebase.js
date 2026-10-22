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
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
  })
}

export const initMessaging = async () => {
  const config = await activeFirebaseConfig()
  if (!config || typeof window === 'undefined') return null
  if (messaging) return messaging

  const { getMessaging, isSupported } = await import('firebase/messaging')
  const supported = await isSupported()
  if (!supported) return null

  const firebaseApp = await getFirebaseApp()
  if (!firebaseApp) return null

  await registerServiceWorker()
  await navigator.serviceWorker.ready

  messaging = getMessaging(firebaseApp)
  return messaging
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
export const isVapidConfigured = Boolean(vapidKey) && !isPlaceholder(vapidKey)

let remoteConfig = null
let remotePromise = null

function apiOrigin() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:5050'
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
  const messagingInstance = await initMessaging()
  if (!messagingInstance) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const { getToken } = await import('firebase/messaging')
  const options = { serviceWorkerRegistration: registration }
  const key = await activeVapidKey()
  if (key) options.vapidKey = key

  return getToken(messagingInstance, options)
}

export const onForegroundMessage = (callback) => {
  let unsubscribe = () => {}
  initMessaging().then(async (instance) => {
    if (!instance) return
    const { onMessage } = await import('firebase/messaging')
    unsubscribe = onMessage(instance, callback)
  })
  return () => unsubscribe()
}
