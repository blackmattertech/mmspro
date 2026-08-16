import { useState, useEffect, useCallback, createContext, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  requestNotificationPermission,
  onForegroundMessage,
  isFirebaseConfigured,
  isVapidConfigured,
} from '../lib/firebase'
import { useAuth } from './useAuth'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  savePushToken,
} from '../lib/api-notifications'

const NotificationContext = createContext(null)

function mapItems(items) {
  return (items || []).map((item) => ({
    ...item,
    time: item.time ? new Date(item.time) : new Date(),
    read: Boolean(item.read),
  }))
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [pushConfigured, setPushConfigured] = useState(false)
  const [inboxReady, setInboxReady] = useState(true)

  const loadFeed = useCallback(async () => {
    if (!user) {
      setNotifications([])
      return
    }
    try {
      const data = await listNotifications()
      setNotifications(mapItems(data?.items))
      setPushConfigured(Boolean(data?.push_configured))
      setInboxReady(data?.inbox_ready !== false)
    } catch (err) {
      console.warn('Failed to load notifications:', err.message)
    }
  }, [user])

  const registerToken = useCallback(async () => {
    if (!user) return null
    if (!isFirebaseConfigured) {
      setError('Push notifications are not configured in this environment.')
      return null
    }

    try {
      setError(null)
      const fcmToken = await requestNotificationPermission()
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')
      if (!fcmToken) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          setError('Notifications are blocked in this browser. Enable them in site settings.')
        }
        return null
      }

      setToken(fcmToken)
      await savePushToken(fcmToken)
      return fcmToken
    } catch (err) {
      setError(err.message || 'Failed to register for notifications')
      return null
    }
  }, [user])

  useEffect(() => {
    loadFeed()
  }, [loadFeed])

  useEffect(() => {
    if (!user) return undefined
    const timer = setInterval(() => { loadFeed() }, 45000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadFeed()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, loadFeed])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return undefined
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined
    registerToken()
    return undefined
  }, [user, registerToken])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return undefined
    const unsub = onForegroundMessage(() => {
      loadFeed()
    })
    return () => unsub()
  }, [user, loadFeed])

  useEffect(() => {
    if (!user || typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      if (event.data?.type === 'mmspro-notification') loadFeed()
      if (event.data?.type === 'mmspro-notification-click') {
        const url = event.data.url
        if (!url || url === '/') return
        if (url.startsWith('http')) window.location.href = url
        else navigate(url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [user, loadFeed, navigate])

  const unreadCount = notifications.filter((item) => !item.read).length

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
    try {
      await markAllNotificationsRead()
    } catch (err) {
      console.warn('Failed to mark notifications read:', err.message)
      loadFeed()
    }
  }, [loadFeed])

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((item) => (
      item.id === id ? { ...item, read: true } : item
    )))
    try {
      await markNotificationRead(id)
    } catch (err) {
      console.warn('Failed to mark notification read:', err.message)
    }
  }, [])

  const value = useMemo(() => ({
    permission,
    token,
    error,
    notifications,
    unreadCount,
    isConfigured: isFirebaseConfigured,
    vapidConfigured: isVapidConfigured,
    pushConfigured,
    inboxReady,
    registerToken,
    markAllRead,
    markRead,
    reload: loadFeed,
  }), [
    permission,
    token,
    error,
    notifications,
    unreadCount,
    pushConfigured,
    inboxReady,
    registerToken,
    markAllRead,
    markRead,
    loadFeed,
  ])

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationsProvider')
  }
  return ctx
}
