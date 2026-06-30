import { useEffect, useRef } from 'react'
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
  const {
    notifications,
    unreadCount,
    permission,
    error,
    isConfigured,
    registerToken,
    markAllRead,
    markRead,
  } = useNotifications()

  useEffect(() => {
    if (open) markAllRead()
  }, [open, markAllRead])

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

  const needsPermission = permission !== 'granted'

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="Notifications">
      <div className="notif-panel__header">
        <h3 className="notif-panel__title">Notifications</h3>
        {unreadCount > 0 && (
          <span className="notif-panel__count">{unreadCount} new</span>
        )}
      </div>

      {needsPermission && (
        <div className="notif-panel__banner">
          <p>Enable push notifications to get alerts for work orders and updates.</p>
          <button
            type="button"
            className="notif-panel__enable-btn"
            onClick={() => registerToken()}
          >
            Enable notifications
          </button>
          {error && <p className="notif-panel__error">{error}</p>}
          {!isConfigured && (
            <p className="notif-panel__hint">Firebase is not configured in this environment.</p>
          )}
        </div>
      )}

      <div className="notif-panel__list">
        {notifications.length === 0 ? (
          <p className="notif-panel__empty">No notifications yet</p>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-panel__item ${n.read ? '' : 'notif-panel__item--unread'}`}
              onClick={() => {
                markRead(n.id)
                if (n.url) window.location.href = n.url
              }}
            >
              <span className="notif-panel__item-title">{n.title}</span>
              {n.body && <span className="notif-panel__item-body">{n.body}</span>}
              <span className="notif-panel__item-time">{formatTime(n.time)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
