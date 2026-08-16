import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useNotifications } from '../../hooks/useNotifications'
import './NotificationPanel.css'

function formatTime(date) {
  const now = new Date()
  const diff = now - date
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}

export default function NotificationPanel({ open, onClose, anchorRef }) {
  const panelRef = useRef(null)
  const navigate = useNavigate()
  const { org } = useOrg()
  const {
    notifications,
    unreadCount,
    permission,
    error,
    isConfigured,
    vapidConfigured,
    inboxReady,
    registerToken,
    markAllRead,
    markRead,
    reload,
  } = useNotifications()

  useEffect(() => {
    if (!open) return
    reload?.()
  }, [open, reload])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const needsPermission = typeof Notification !== 'undefined' && permission !== 'granted'
  const insecureOrigin = typeof window !== 'undefined'
    && window.isSecureContext === false
    && window.location.hostname !== 'localhost'

  const openItem = (item) => {
    markRead(item.id)
    onClose()
    const url = item.url || '/'
    if (url.startsWith('http')) {
      window.location.href = url
      return
    }
    if (url === '/' && org?.slug) {
      navigate(`/${org.slug}/dashboard`)
      return
    }
    navigate(url)
  }

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      <div className="notif-panel__header">
        <h3 className="notif-panel__title">Notifications</h3>
        {unreadCount > 0 ? (
          <button type="button" className="notif-panel__mark-all" onClick={() => markAllRead()}>
            Mark all read
          </button>
        ) : (
          <span className="notif-panel__count">Up to date</span>
        )}
      </div>

      {needsPermission && (
        <div className="notif-panel__banner">
          <p>Enable push notifications to get alerts even when MMS PRO is in the background.</p>
          {insecureOrigin ? (
            <p className="notif-panel__hint">
              Push requires HTTPS (use your ngrok URL). In-app notifications still work here.
            </p>
          ) : (
            <button
              type="button"
              className="notif-panel__enable-btn"
              onClick={() => registerToken()}
            >
              Enable push notifications
            </button>
          )}
          {error && <p className="notif-panel__error">{error}</p>}
          {!isConfigured && (
            <p className="notif-panel__hint">Firebase web keys are not configured, so push cannot register on this device.</p>
          )}
          {isConfigured && !vapidConfigured && !insecureOrigin && (
            <p className="notif-panel__hint">
              Add VITE_FIREBASE_VAPID_KEY from Firebase Console → Project settings → Cloud Messaging → Web Push certificates, then restart Vite.
            </p>
          )}
        </div>
      )}

      <div className="notif-panel__list">
        {notifications.length === 0 ? (
          <p className="notif-panel__empty">
            {inboxReady ? 'No notifications yet' : 'In-app inbox is not set up yet. Apply supabase-patches/64-user-notifications.sql in the Supabase SQL editor.'}
          </p>
        ) : (
          notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`notif-panel__item ${item.read ? '' : 'notif-panel__item--unread'}`}
              onClick={() => openItem(item)}
            >
              <span className="notif-panel__item-title">{item.title}</span>
              {item.body && <span className="notif-panel__item-body">{item.body}</span>}
              <span className="notif-panel__item-time">{formatTime(item.time)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
