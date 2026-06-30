import { initializeApp, getApps } from 'firebase/app'
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics'
import { getMessaging, getToken, onMessage, isSupported as isMessagingSupported } from 'firebase/messaging'

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

const getFirebaseApp = () => {
  if (!isFirebaseConfigured || typeof window === 'undefined') return null
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  }
  return app
}

export const initAnalytics = async () => {
  if (!isFirebaseConfigured || analyticsInitStarted || typeof window === 'undefined') return null
  analyticsInitStarted = true

  if (!firebaseConfig.measurementId || isPlaceholder(firebaseConfig.measurementId)) return null

  const supported = await isAnalyticsSupported()
  if (!supported) return null

  const firebaseApp = getFirebaseApp()
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

  const supported = await isMessagingSupported()
  if (!supported) return null

  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null

  await registerServiceWorker()
  await navigator.serviceWorker.ready

  messaging = getMessaging(firebaseApp)
  return messaging
}

export const requestNotificationPermission = async () => {
  const messagingInstance = await initMessaging()
  if (!messagingInstance) return null

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey || isPlaceholder(vapidKey)) {
    console.warn('VITE_FIREBASE_VAPID_KEY is not configured')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready

  return getToken(messagingInstance, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })
}

export const onForegroundMessage = (callback) => {
  if (!messaging) {
    initMessaging().then((instance) => {
      if (instance) onMessage(instance, callback)
    })
    return () => {}
  }

  return onMessage(messaging, callback)
}
