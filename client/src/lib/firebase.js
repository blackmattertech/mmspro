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
  if (!isFirebaseConfigured || typeof window === 'undefined') return null
  if (app) return app
  if (!appInflight) {
    appInflight = import('firebase/app').then(({ initializeApp, getApps }) => {
      app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
      return app
    })
  }
  return appInflight
}

export const initAnalytics = async () => {
  if (!isFirebaseConfigured || analyticsInitStarted || typeof window === 'undefined') return null
  analyticsInitStarted = true

  if (!firebaseConfig.measurementId || isPlaceholder(firebaseConfig.measurementId)) return null

  const { getAnalytics, isSupported } = await import('firebase/analytics')
  const supported = await isSupported()
  if (!supported) return null

  const firebaseApp = await getFirebaseApp()
  if (!firebaseApp) return null

  return getAnalytics(firebaseApp)
}

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
}

export const initMessaging = async () => {
  if (!isFirebaseConfigured || typeof window === 'undefined') return null
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

export const requestNotificationPermission = async () => {
  const messagingInstance = await initMessaging()
  if (!messagingInstance) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const { getToken } = await import('firebase/messaging')
  const options = { serviceWorkerRegistration: registration }
  if (isVapidConfigured) options.vapidKey = vapidKey
  else console.warn('VITE_FIREBASE_VAPID_KEY is not set; using the Firebase default Web Push key')

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
