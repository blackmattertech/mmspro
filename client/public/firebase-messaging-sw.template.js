importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

const fallbackConfig = {
  apiKey: '__VITE_FIREBASE_API_KEY__',
  authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
  projectId: '__VITE_FIREBASE_PROJECT_ID__',
  storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__VITE_FIREBASE_APP_ID__',
}

function isUsableConfig(config) {
  if (!config?.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) return false
  const apiKey = String(config.apiKey)
  const projectId = String(config.projectId)
  if (apiKey.includes('__VITE_') || projectId.includes('__VITE_') || /^your_/i.test(apiKey)) return false
  return true
}

let messagingStarted = false

function notifyOpenClients(payload) {
  const message = {
    type: 'mmspro-notification',
    title: payload.notification?.title || payload.data?.title || 'MMS PRO',
    body: payload.notification?.body || payload.data?.body || '',
    url: payload.data?.url || '/',
    notificationType: payload.data?.type || '',
    sound: payload.data?.sound || 'https://ik.imagekit.io/w2lf8dznx/notification',
  }
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    windowClients.forEach((client) => client.postMessage(message))
  })
}

function startMessaging(config) {
  if (messagingStarted || !isUsableConfig(config)) return
  if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    })
  }
  const messaging = firebase.messaging()
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'MMS PRO'
    const body = payload.notification?.body || payload.data?.body || ''
    const url = payload.data?.url || '/'
    return Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        silent: false,
        data: { ...(payload.data || {}), url },
      }),
      notifyOpenClients(payload),
    ])
  })
  messagingStarted = true
}

// importScripts blocks service-worker startup, so the push listener exists
// before Chrome delivers a push that woke this worker (app installed, window closed).
try {
  importScripts(new URL('/api/integrations/firebase-messaging-config.js', self.location.origin).href)
} catch {
  // Fall back to the config baked in at build time.
}

const remote = self.__MMSPRO_FIREBASE__
if (!remote?.disabled) {
  if (remote?.configured) startMessaging(remote)
  else startMessaging(fallbackConfig)
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const target = url.startsWith('http') ? url : new URL(url, self.location.origin).href
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.postMessage({ type: 'mmspro-notification-click', url })
        return client.focus()
      }
    }
    return self.clients.openWindow(target)
  })())
})
