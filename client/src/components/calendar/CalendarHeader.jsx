import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterableSelect from '../ui/FilterableSelect'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { LEGEND_ITEMS, EVENT_SOURCE_COLORS } from '../../data/calendarDemo'
import '../dashboard/DashboardHeader.css'

const VIEW_OPTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export default function CalendarHeader({
  plants,
  plantFilter,
  onPlantChange,
}) {
  return (
    <header className="dash-header cal-page-header">
      <div className="dash-header__left">
        <h1 className="dash-header__title">Work Calendar</h1>
        <p className="dash-header__subtitle">
          Tasks, work orders, work requests, PM schedules, and warranty dates
        </p>
      </div>

      <div className="dash-header__right">
        <div className="dash-header__filter">
          <label className="dash-header__filter-label" htmlFor="cal-plant-filter">Location</label>
          <FilterableSelect
            id="cal-plant-filter"
            value={plantFilter}
            onChange={onPlantChange}
            options={[
              { value: 'all', label: 'All Locations' },
              ...(plants || []).map((p) => ({ value: p.id, label: p.name })),
            ]}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
            inputClassName="dash-header__select"
          />
        </div>
      </div>
    </header>
  )
}

function useCreateMenuItems() {
  const { canCreate } = usePermissions()
  return [
    canCreate('work_request_create') && { label: 'Work Request', path: 'work-request/create' },
    (canCreate('work_orders_manual') || canCreate('work_orders')) && { label: 'Work Order', path: 'work-orders/manual/create' },
    canCreate('work_orders_scheduled') && { label: 'PM Schedule', path: 'work-orders/scheduled?create=1' },
    canCreate('tasks_followups') && { label: 'Task', path: 'tasks-and-followups/create' },
    canCreate('warranty_manager') && { label: 'Warranty', path: 'warranty-manager/create' },
    canCreate('vendors') && { label: 'Vendor', path: 'masters/vendors?create=1' },
  ].filter(Boolean)
}

export function CalendarToolbar({
  monthLabel,
  viewMode,
  onViewModeChange,
  onToday,
  onPrevMonth,
  onNextMonth,
  logFilter,
  onLogFilterChange,
  showLegend = true,
}) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const items = useCreateMenuItems()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const slug = org?.slug

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDocClick = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__left">
        <button type="button" className="cal-toolbar__today-btn" onClick={onToday}>
          Today
        </button>
        <div className="cal-toolbar__nav">
          <button type="button" className="cal-toolbar__nav-btn" onClick={onPrevMonth} aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="cal-toolbar__month">{monthLabel}</span>
          <button type="button" className="cal-toolbar__nav-btn" onClick={onNextMonth} aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        {showLegend && (
          <div className="cal-legend cal-legend--toolbar">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.key} className="cal-legend__item">
                <span
                  className="cal-legend__dot"
                  style={{ background: EVENT_SOURCE_COLORS[item.key] }}
                />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="cal-toolbar__right">
        {onLogFilterChange && (
          <FilterableSelect
            inputClassName="cal-filters__select"
            value={logFilter}
            onChange={onLogFilterChange}
            options={[
              { value: 'all', label: 'All items' },
              { value: 'task', label: 'Tasks' },
              { value: 'work_order', label: 'Work orders' },
              { value: 'work_request', label: 'Work requests' },
              { value: 'pm_plan', label: 'PM schedules' },
              { value: 'warranty', label: 'Warranties' },
            ]}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
          />
        )}
        <div className="cal-view-toggle" role="group" aria-label="Calendar view">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cal-view-toggle__btn ${viewMode === opt.id ? 'cal-view-toggle__btn--active' : ''}`}
              onClick={() => onViewModeChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {items.length > 0 && (
          <div className="cal-toolbar__create" ref={menuRef}>
            <button
              type="button"
              className="cal-toolbar__create-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Create
            </button>
            {menuOpen && (
              <div className="cal-toolbar__create-menu" role="menu">
                {items.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    role="menuitem"
                    className="cal-toolbar__create-item"
                    onClick={() => {
                      setMenuOpen(false)
                      if (slug) navigate(orgPath(slug, item.path))
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
