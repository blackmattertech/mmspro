importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: '__VITE_FIREBASE_API_KEY__',
  authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
  projectId: '__VITE_FIREBASE_PROJECT_ID__',
  storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__VITE_FIREBASE_APP_ID__',
})

const messaging = firebase.messaging()

function notifyOpenClients(payload) {
  const message = {
    type: 'mmspro-notification',
    title: payload.notification?.title || payload.data?.title || 'MMS PRO',
    body: payload.notification?.body || payload.data?.body || '',
    url: payload.data?.url || '/',
  }
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    windowClients.forEach((client) => client.postMessage(message))
  })
}

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'MMS PRO'
  const body = payload.notification?.body || payload.data?.body || ''
  const url = payload.data?.url || '/'

  return Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { ...(payload.data || {}), url },
    }),
    notifyOpenClients(payload),
  ])
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
