import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DateField from '../ui/DateField'
import FilterableSelect from '../ui/FilterableSelect'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
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

  return (
    <>
      <header className="dash-header">
        <div className="dash-header__left">
          <h1 className="dash-header__title">Calendar</h1>
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

          <div className="dash-header__date-range">
            <DateField
              className="dash-header__date"
              value={dateFrom}
              onChange={onDateFromChange}
            />
            <span className="dash-header__date-sep">–</span>
            <DateField
              className="dash-header__date"
              value={dateTo}
              onChange={onDateToChange}
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
}) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate } = usePermissions()
  const [menuOpen, setMenuOpen] = useState(false)
  const slug = org?.slug
  const items = [
    canCreate('work_request_create') && { label: 'Work Request', path: 'work-request/create' },
    (canCreate('work_orders_manual') || canCreate('work_orders')) && { label: 'Work Order', path: 'work-orders/manual/create' },
    canCreate('work_orders_scheduled') && { label: 'PM Schedule', path: 'work-orders/scheduled?create=1' },
    canCreate('tasks_followups') && { label: 'Task', path: 'tasks-and-followups/create' },
    canCreate('warranty_manager') && { label: 'Warranty', path: 'warranty-manager/create' },
    canCreate('vendors') && { label: 'Vendor', path: 'masters/vendors?create=1' },
  ].filter(Boolean)

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

        {items.length > 0 && (
          <div className="cal-toolbar__create">
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
    </>
  )
}
