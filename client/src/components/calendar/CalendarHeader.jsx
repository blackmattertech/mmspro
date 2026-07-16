import { useState, useRef } from 'react'
import CreateWorkOrderModal from '../dashboard/CreateWorkOrderModal'
import NotificationPanel from '../dashboard/NotificationPanel'
import { useNotifications } from '../../hooks/useNotifications'
import '../dashboard/DashboardHeader.css'

export default function CalendarHeader({
  plants,
  plantFilter,
  onPlantChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onCreateTask,
}) {
  const [showModal, setShowModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const notifBtnRef = useRef(null)
  const { unreadCount } = useNotifications()

  return (
    <>
      <header className="dash-header">
        <div className="dash-header__left">
          <h1 className="dash-header__title">Calendar</h1>
          <p className="dash-header__subtitle">
            View and manage all scheduled tasks and follow-ups
          </p>
        </div>

        <div className="dash-header__right">
          <div className="dash-header__filter">
            <label className="dash-header__filter-label" htmlFor="cal-plant-filter">Location</label>
            <select
              id="cal-plant-filter"
              className="dash-header__select"
              value={plantFilter}
              onChange={(e) => onPlantChange(e.target.value)}
            >
              <option value="all">All Locations</option>
              {(plants || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="dash-header__date-range">
            <input
              type="date"
              className="dash-header__date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
            />
            <span className="dash-header__date-sep">–</span>
            <input
              type="date"
              className="dash-header__date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
            />
          </div>

          <div className="dash-header__icon-wrap">
            <button
              ref={notifBtnRef}
              type="button"
              className="dash-header__icon-btn dash-header__icon-btn--primary"
              aria-label="Notifications"
              aria-expanded={showNotifications}
              onClick={() => setShowNotifications((prev) => !prev)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2.5C7.5 2.5 6 4.5 6 7V10.5L4 13V14H16V13L14 10.5V7C14 4.5 12.5 2.5 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8.5 14V14.5C8.5 15.6 9.15 16.5 10 16.5C10.85 16.5 11.5 15.6 11.5 14.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {unreadCount > 0 && (
                <span className="dash-header__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <NotificationPanel
              open={showNotifications}
              onClose={() => setShowNotifications(false)}
              anchorRef={notifBtnRef}
            />
          </div>

          <button type="button" className="dash-header__icon-btn dash-header__icon-btn--primary" aria-label="Messages">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="5" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 6.5L10 11L17 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </header>

      {showModal && (
        <CreateWorkOrderModal
          plants={plants}
          onClose={() => setShowModal(false)}
          onSubmit={async (data) => {
            await onCreateTask?.(data)
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}

export function CalendarToolbar({
  monthLabel,
  viewMode,
  onViewModeChange,
  onToday,
  onPrevMonth,
  onNextMonth,
  onCreateTask,
  plants,
}) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div className="cal-toolbar">
        <div className="cal-toolbar__left">
          <button type="button" className="cal-toolbar__today-btn" onClick={onToday}>
            Today
          </button>
          <div className="cal-toolbar__nav">
            <button type="button" className="cal-toolbar__nav-btn" onClick={onPrevMonth} aria-label="Previous month">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="cal-toolbar__month">{monthLabel}</span>
            <button type="button" className="cal-toolbar__nav-btn" onClick={onNextMonth} aria-label="Next month">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="cal-toolbar__center">
          <div className="cal-view-toggle">
            <button
              type="button"
              className={`cal-view-toggle__btn ${viewMode === 'calendar' ? 'cal-view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange('calendar')}
            >
              Calendar View
            </button>
            <button
              type="button"
              className={`cal-view-toggle__btn ${viewMode === 'table' ? 'cal-view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange('table')}
            >
              Table View
            </button>
          </div>
        </div>

        <button
          type="button"
          className="cal-toolbar__create-btn"
          onClick={() => setShowModal(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Create Task
        </button>
      </div>

      {showModal && (
        <CreateWorkOrderModal
          plants={plants}
          onClose={() => setShowModal(false)}
          onSubmit={async (data) => {
            await onCreateTask?.(data)
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}
