import { useRef, useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationPanel from '../dashboard/NotificationPanel'
import '../dashboard/DashboardHeader.css'

export default function NotificationBell({ variant = 'header', collapsed = false }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const { unreadCount } = useNotifications()
  const wrapClass = variant === 'sidebar'
    ? `sidebar__notif${collapsed ? ' sidebar__notif--collapsed' : ''}`
    : 'dash-header__icon-wrap'

  return (
    <div className={wrapClass}>
      <button
        ref={btnRef}
        type="button"
        className={variant === 'sidebar' ? 'sidebar__notif-btn' : 'dash-header__icon-btn dash-header__icon-btn--primary'}
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2.5C7.5 2.5 6 4.5 6 7V10.5L4 13V14H16V13L14 10.5V7C14 4.5 12.5 2.5 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M8.5 14V14.5C8.5 15.6 9.15 16.5 10 16.5C10.85 16.5 11.5 15.6 11.5 14.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {variant === 'sidebar' && !collapsed && (
          <span className="sidebar__notif-label">Notifications</span>
        )}
        {unreadCount > 0 && (
          <span className={variant === 'sidebar' ? 'sidebar__notif-badge' : 'dash-header__badge'}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {variant === 'sidebar' && collapsed && (
          <span className="sidebar__tooltip" aria-hidden="true">Notifications</span>
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
