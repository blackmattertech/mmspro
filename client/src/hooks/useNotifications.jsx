import { useState, useEffect, useCallback, createContext, useContext, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  requestNotificationPermission,
  onForegroundMessage,
  isFirebaseConfigured,
  isVapidConfigured,
} from '../lib/firebase'
import { playNotificationSound, unlockNotificationSound } from '../lib/notificationSound'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import { orgPath } from '../config/navigation'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  savePushToken,
} from '../lib/api-notifications'
import { getUpcomingTaskReminders } from '../lib/api-tasks'
import TaskReminderModal from '../components/tasks/TaskReminderModal'

const NotificationContext = createContext(null)
const SHOWN_REMINDERS_KEY = 'mmspro-shown-task-reminders'

function mapItems(items) {
  return (items || []).map((item) => ({
    ...item,
    time: item.time ? new Date(item.time) : new Date(),
    read: Boolean(item.read),
  }))
}

function readShownReminderIds() {
  try {
    const raw = sessionStorage.getItem(SHOWN_REMINDERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function persistShownReminderIds(ids) {
  try {
    sessionStorage.setItem(SHOWN_REMINDERS_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore storage errors
  }
}

function reminderFromSource(source = {}) {
  const data = source.data && typeof source.data === 'object' ? source.data : {}
  const type = String(source.notificationType || source.type || data.type || '').toLowerCase()
  const title = String(source.title || source.notification?.title || data.title || '')
  if (type !== 'task_reminder' && !title.toLowerCase().includes('reminder')) return null
  const taskId = data.task_id || source.task_id
  if (!taskId) return null
  return {
    id: data.reminder_id || source.id || `task-${taskId}`,
    task_id: taskId,
    title: source.body || data.body || source.title || data.title || 'Task reminder',
    task_number: data.task_number || source.task_number || '',
    short_description: data.short_description || source.short_description || '',
    due_date: data.due_date || source.due_date || '',
    due_time: data.due_time || source.due_time || '',
    remind_at: source.remind_at || null,
  }
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const { org } = useOrg()
  const navigate = useNavigate()
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [pushConfigured, setPushConfigured] = useState(false)
  const [inboxReady, setInboxReady] = useState(true)
  const [activeReminder, setActiveReminder] = useState(null)
  const knownIdsRef = useRef(null)
  const reminderTimersRef = useRef(new Map())
  const reminderQueueRef = useRef([])
  const shownRemindersRef = useRef(readShownReminderIds())
  const activeReminderRef = useRef(null)

  const queueReminderPopup = useCallback((reminder) => {
    if (!reminder?.id || !reminder.task_id) return
    if (shownRemindersRef.current.has(reminder.id)) return
    shownRemindersRef.current.add(reminder.id)
    persistShownReminderIds(shownRemindersRef.current)

    if (!activeReminderRef.current) {
      activeReminderRef.current = reminder
      setActiveReminder(reminder)
      playNotificationSound({ kind: 'reminder' })
      return
    }

    if (activeReminderRef.current.id === reminder.id) return
    if (reminderQueueRef.current.some((item) => item.id === reminder.id)) return
    reminderQueueRef.current = [...reminderQueueRef.current, reminder]
  }, [])

  const dismissReminderPopup = useCallback(() => {
    const next = reminderQueueRef.current[0] || null
    reminderQueueRef.current = reminderQueueRef.current.slice(1)
    activeReminderRef.current = next
    setActiveReminder(next)
    if (next) playNotificationSound({ kind: 'reminder' })
  }, [])

  const openReminderTask = useCallback(() => {
    const reminder = activeReminderRef.current
    dismissReminderPopup()
    if (!reminder?.task_id) return
    const path = org?.slug
      ? orgPath(org.slug, `tasks-and-followups/${reminder.task_id}`)
      : `/tasks-and-followups/${reminder.task_id}`
    navigate(path)
  }, [dismissReminderPopup, navigate, org?.slug])

  const loadFeed = useCallback(async () => {
    if (!user) {
      setNotifications([])
      knownIdsRef.current = null
      return
    }
    try {
      const data = await listNotifications()
      const items = mapItems(data?.items)
      const previousIds = knownIdsRef.current
      const nextIds = new Set(items.map((item) => item.id).filter(Boolean))
      const newItems = previousIds
        ? items.filter((item) => item.id && !previousIds.has(item.id))
        : []
      knownIdsRef.current = nextIds
      setNotifications(items)
      setPushConfigured(Boolean(data?.push_configured))
      setInboxReady(data?.inbox_ready !== false)

      const reminderItems = []
      for (const item of newItems) {
        const reminder = reminderFromSource(item)
        if (reminder) {
          reminderItems.push(reminder)
          queueReminderPopup(reminder)
        }
      }
      const other = newItems.find((item) => !reminderFromSource(item))
      if (other) playNotificationSound(other)
    } catch (err) {
      console.warn('Failed to load notifications:', err.message)
    }
  }, [user, queueReminderPopup])

  const loadUpcomingReminders = useCallback(async () => {
    if (!user) return
    try {
      const data = await getUpcomingTaskReminders()
      const items = data?.items || []
      const timers = reminderTimersRef.current

      for (const [id, timer] of timers) {
        if (!items.some((item) => item.id === id)) {
          clearTimeout(timer)
          timers.delete(id)
        }
      }

      for (const item of items) {
        if (!item?.id || shownRemindersRef.current.has(item.id) || timers.has(item.id)) continue
        const delay = new Date(item.remind_at).getTime() - Date.now()
        if (Number.isNaN(delay)) continue
        if (delay <= 0) {
          queueReminderPopup(item)
          continue
        }
        timers.set(item.id, setTimeout(() => {
          reminderTimersRef.current.delete(item.id)
          queueReminderPopup(item)
        }, delay))
      }
    } catch (err) {
      console.warn('Failed to load upcoming reminders:', err.message)
    }
  }, [user, queueReminderPopup])

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
    const unlock = () => unlockNotificationSound()
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    loadFeed()
    loadUpcomingReminders()
  }, [loadFeed, loadUpcomingReminders])

  useEffect(() => {
    if (!user) return undefined
    const notifTimer = setInterval(() => { loadFeed() }, 45000)
    const reminderTimer = setInterval(() => { loadUpcomingReminders() }, 30000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadFeed()
        loadUpcomingReminders()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(notifTimer)
      clearInterval(reminderTimer)
      document.removeEventListener('visibilitychange', onVisible)
      for (const timer of reminderTimersRef.current.values()) clearTimeout(timer)
      reminderTimersRef.current.clear()
    }
  }, [user, loadFeed, loadUpcomingReminders])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return undefined
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined
    registerToken()
    return undefined
  }, [user, registerToken])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return undefined
    const unsub = onForegroundMessage((payload) => {
      const reminder = reminderFromSource(payload)
      if (reminder) queueReminderPopup(reminder)
      else playNotificationSound(payload)
      loadFeed()
    })
    return () => unsub()
  }, [user, loadFeed, queueReminderPopup])

  useEffect(() => {
    if (!user || typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      if (event.data?.type === 'mmspro-notification') {
        const reminder = reminderFromSource(event.data)
        if (reminder) queueReminderPopup(reminder)
        else playNotificationSound(event.data)
        loadFeed()
      }
      if (event.data?.type === 'mmspro-notification-click') {
        const url = event.data.url
        if (!url || url === '/') return
        if (url.startsWith('http')) window.location.href = url
        else navigate(url)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [user, loadFeed, navigate, queueReminderPopup])

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
      <TaskReminderModal
        reminder={activeReminder}
        onDismiss={dismissReminderPopup}
        onOpen={openReminderTask}
      />
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
