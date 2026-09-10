import { useRef, useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationPanel from '../dashboard/NotificationPanel'
import '../dashboard/DashboardHeader.css'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const { unreadCount } = useNotifications()

  return (
    <div className="app-shell__notif">
      <button
        ref={btnRef}
        type="button"
        className="dash-header__icon-btn dash-header__icon-btn--primary"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 2a5.25 5.25 0 0 0-5.25 5.25v2.37l-1.58 2.64A1.15 1.15 0 0 0 4.16 14h11.68a1.15 1.15 0 0 0 1-1.74l-1.59-2.64V7.25A5.25 5.25 0 0 0 10 2Z" />
          <path d="M8.1 15.35a2.1 2.1 0 0 0 3.8 0H8.1Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="dash-header__badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
      />
    </div>
  )
}
