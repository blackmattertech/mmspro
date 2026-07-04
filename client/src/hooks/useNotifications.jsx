import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import {
  requestNotificationPermission,
  onForegroundMessage,
  isFirebaseConfigured,
} from '../lib/firebase'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from './useAuth'

const STORAGE_KEY = 'mmspro-notifications'

const NotificationContext = createContext(null)

function loadStoredNotifications() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw).map((n) => ({ ...n, time: new Date(n.time) }))
  } catch {
    return []
  }
}

function saveNotifications(items) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [notifications, setNotifications] = useState(loadStoredNotifications)
  const idRef = useRef(0)

  const addNotification = useCallback((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'MMS PRO'
    const body = payload.notification?.body || payload.data?.body || ''
    const url = payload.fcmOptions?.link || payload.data?.url || null

    const item = {
      id: `n-${Date.now()}-${idRef.current++}`,
      title,
      body,
      url,
      time: new Date(),
      read: false,
    }

    setNotifications((prev) => {
      const next = [item, ...prev].slice(0, 50)
      saveNotifications(next)
      return next
    })

    return item
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }))
      saveNotifications(next)
      return next
    })
  }, [])

  const markRead = useCallback((id) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      saveNotifications(next)
      return next
    })
  }, [])

  const registerToken = useCallback(async () => {
    if (!isFirebaseConfigured || !isSupabaseConfigured || !supabase || !user) return null

    try {
      setError(null)
      const fcmToken = await requestNotificationPermission()
      if (!fcmToken) {
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')
        return null
      }

      setPermission('granted')
      setToken(fcmToken)

      const { error: saveError } = await supabase.from('fcm_tokens').upsert(
        { user_id: user.id, token: fcmToken },
        { onConflict: 'token' }
      )

      if (saveError) throw saveError
      return fcmToken
    } catch (err) {
      setError(err.message || 'Failed to register for notifications')
      return null
    }
  }, [user])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return

    const unsub = onForegroundMessage((payload) => {
      const item = addNotification(payload)
      const title = item.title
      const body = item.body

      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.svg',
        })
      }
    })

    return () => unsub()
  }, [user, addNotification])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return
    registerToken()
  }, [user, registerToken])

  const value = {
    permission,
    token,
    error,
    notifications,
    unreadCount,
    isConfigured: isFirebaseConfigured,
    registerToken,
    markAllRead,
    markRead,
    addNotification,
  }

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
