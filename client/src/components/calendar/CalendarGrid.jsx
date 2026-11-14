import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EVENT_SOURCE_COLORS, EVENT_SOURCE_BG, SOURCE_FILTERS, SOURCE_LABELS, LEGEND_ITEMS, eventColorKey } from '../../data/calendarDemo'
import { buildCalendarGrid } from '../../hooks/useCalendar'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { calendarEventPath } from '../../lib/calendarEventPath'
import { orgPath } from '../../config/navigation'
import { tableRowClickProps } from '../../lib/clickableTableRow'
import FilterableSelect from '../ui/FilterableSelect'
import { formatDisplayDate } from '../../lib/displayDate'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_MONTH_EVENTS = 3
const MAX_WEEK_EVENTS = 6

function useEventPath(task) {
  const { org } = useOrg()
  const { canRead } = usePermissions()
  return calendarEventPath(org?.slug, task, canRead)
}

function useCreateItems(isoDate) {
  const { canCreate } = usePermissions()
  const withDate = (path, param = 'start_date') => {
    if (!isoDate) return path
    const join = path.includes('?') ? '&' : '?'
    return `${path}${join}${param}=${encodeURIComponent(isoDate)}`
  }

  return [
    canCreate('work_request_create') && { label: 'Work Request', path: withDate('work-request/create', 'date') },
    (canCreate('work_orders_manual') || canCreate('work_orders')) && { label: 'Work Order', path: withDate('work-orders/manual/create', 'date') },
    canCreate('work_orders_scheduled') && { label: 'PM Schedule', path: withDate('work-orders/scheduled?create=1', 'start_date') },
    canCreate('tasks_followups') && { label: 'Task', path: withDate('tasks-and-followups/create', 'start_date') },
    canCreate('warranty_manager') && { label: 'Warranty', path: withDate('warranty-manager/create', 'date') },
  ].filter(Boolean)
}

export function CalendarFilters({
  logFilter,
  onLogFilterChange,
  plantFilter,
  onPlantFilterChange,
  workCenterFilter,
  onWorkCenterFilterChange,
  plants,
  workCenters,
  compact = false,
}) {
  return (
    <div className={`cal-filters ${compact ? 'cal-filters--compact' : ''}`}>
      <div className="cal-filters__dropdowns">
        <FilterableSelect
          inputClassName="cal-filters__select"
          value={logFilter}
          onChange={onLogFilterChange}
          options={SOURCE_FILTERS}
          getOptionValue={(opt) => opt.value}
          getOptionLabel={(opt) => opt.label}
          allowEmpty={false}
        />
        <FilterableSelect
          inputClassName="cal-filters__select"
          value={plantFilter}
          onChange={onPlantFilterChange}
          options={[
            { value: 'all', label: 'All Locations' },
            ...(plants || []).map((p) => ({ value: p.id, label: p.name })),
          ]}
          getOptionValue={(opt) => opt.value}
          getOptionLabel={(opt) => opt.label}
          allowEmpty={false}
        />
        {!compact && (
          <FilterableSelect
            inputClassName="cal-filters__select"
            value={workCenterFilter}
            onChange={onWorkCenterFilterChange}
            options={[
              { value: 'all', label: 'All Work Centers' },
              ...(workCenters || []).map((wc) => ({ value: wc.id, label: wc.name })),
            ]}
            getOptionValue={(opt) => opt.value}
            getOptionLabel={(opt) => opt.label}
            allowEmpty={false}
          />
        )}
      </div>

      <div className="cal-legend">
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
    </div>
  )
}

function EventPill({ task }) {
  const colorKey = eventColorKey(task)
  const to = useEventPath(task)
  const label = `${SOURCE_LABELS[task.source] || 'Item'}: ${task.title}`
  const color = EVENT_SOURCE_COLORS[colorKey] || EVENT_SOURCE_COLORS.task
  const bg = EVENT_SOURCE_BG[colorKey] || EVENT_SOURCE_BG.task
  const body = (
    <>
      <span className="cal-pill__dot" style={{ background: color }} aria-hidden="true" />
      <span className="cal-pill__title">{task.title}</span>
    </>
  )
  const style = { background: bg, borderColor: color }

  if (!to) {
    return (
      <div className="cal-pill" style={style} title={label}>
        {body}
      </div>
    )
  }
  return (
    <Link
      className="cal-pill"
      style={style}
      title={label}
      to={to}
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </Link>
  )
}

function CreateDayMenu({ isoDate, open, onClose }) {
  const navigate = useNavigate()
  const { org } = useOrg()
  const items = useCreateItems(isoDate)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (!menuRef.current?.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, onClose])

  if (!open || items.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="cal-day-menu"
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="cal-day-menu__hint">Create on {isoDate}</p>
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          role="menuitem"
          className="cal-day-menu__item"
          onClick={() => {
            onClose?.()
            if (org?.slug) navigate(orgPath(org.slug, item.path))
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function DayCell({
  cell,
  tasks = [],
  isToday,
  isSelected,
  maxEvents,
  onSelect,
  onOpenDay,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const visible = tasks.slice(0, maxEvents)
  const overflow = tasks.length - visible.length

  return (
    <div
      className={[
        'cal-grid__cell',
        !cell.currentMonth ? 'cal-grid__cell--other' : '',
        isToday ? 'cal-grid__cell--today' : '',
        isSelected ? 'cal-grid__cell--selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect?.(cell.iso)}
      onDoubleClick={() => {
        onSelect?.(cell.iso)
        setMenuOpen(true)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(cell.iso)
        }
      }}
      aria-label={`${cell.iso}, ${tasks.length} items`}
    >
      <div className="cal-grid__cell-head">
        <span className={`cal-grid__day ${isToday ? 'cal-grid__day--today' : ''}`}>
          {cell.day}
        </span>
        <button
          type="button"
          className="cal-grid__add"
          title="Create on this date"
          aria-label={`Create on ${cell.iso}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(cell.iso)
            setMenuOpen((open) => !open)
          }}
        >
          +
        </button>
      </div>
      <div className="cal-grid__tasks">
        {visible.map((task) => (
          <EventPill key={task.id} task={task} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            className="cal-grid__more"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDay?.(cell.iso)
            }}
            title={`Show ${overflow} more`}
          >
            +{overflow} more
          </button>
        )}
      </div>
      <CreateDayMenu
        isoDate={cell.iso}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  )
}

export function CalendarGrid({
  year,
  month,
  tasksByDate,
  todayIso,
  selectedDate,
  onSelectDate,
  onOpenDay,
  viewMode = 'month',
  weekDays = [],
  dayTasks = [],
}) {
  if (viewMode === 'day') {
    return (
      <DayAgenda
        isoDate={selectedDate || todayIso}
        tasks={dayTasks}
      />
    )
  }

  if (viewMode === 'week') {
    return (
      <div className="cal-grid cal-grid--week">
        <div className="cal-grid__weekdays">
          {weekDays.map((day) => (
            <span key={day.iso} className="cal-grid__weekday">
              {day.weekday} {day.day}
            </span>
          ))}
        </div>
        <div className="cal-grid__cells cal-grid__cells--week">
          {weekDays.map((day) => (
            <DayCell
              key={day.iso}
              cell={{ ...day, currentMonth: true }}
              tasks={tasksByDate[day.iso] || []}
              isToday={day.iso === todayIso}
              isSelected={day.iso === selectedDate}
              maxEvents={MAX_WEEK_EVENTS}
              onSelect={onSelectDate}
              onOpenDay={onOpenDay}
            />
          ))}
        </div>
      </div>
    )
  }

  const cells = buildCalendarGrid(year, month)

  return (
    <div className="cal-grid cal-grid--month">
      <div className="cal-grid__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day} className="cal-grid__weekday">{day}</span>
        ))}
      </div>
      <div className="cal-grid__cells">
        {cells.map((cell) => (
          <DayCell
            key={cell.iso}
            cell={cell}
            tasks={cell.currentMonth ? (tasksByDate[cell.iso] || []) : []}
            isToday={cell.iso === todayIso}
            isSelected={cell.iso === selectedDate}
            maxEvents={MAX_MONTH_EVENTS}
            onSelect={onSelectDate}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  )
}

function DayAgenda({ isoDate, tasks }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const label = isoDate
    ? `${new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}, ${formatDisplayDate(isoDate)}`
    : 'Selected day'

  return (
    <div className="cal-day-agenda">
      <div className="cal-day-agenda__head">
        <h3 className="cal-day-agenda__title">{label}</h3>
        <button
          type="button"
          className="cal-toolbar__create-btn"
          onClick={() => setMenuOpen((open) => !open)}
        >
          + Create
        </button>
        <CreateDayMenu isoDate={isoDate} open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
      {!tasks?.length ? (
        <p className="cal-panel__empty">No items scheduled for this day. Click Create or use + on a date.</p>
      ) : (
        <ul className="cal-day-agenda__list">
          {tasks.map((task) => (
            <DayAgendaItem key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DayAgendaItem({ task }) {
  const to = useEventPath(task)
  const colorKey = eventColorKey(task)
  const color = EVENT_SOURCE_COLORS[colorKey] || EVENT_SOURCE_COLORS.task
  const bg = EVENT_SOURCE_BG[colorKey] || EVENT_SOURCE_BG.task
  const body = (
    <>
      <span className="cal-day-agenda__dot" style={{ background: color }} aria-hidden="true" />
      <div className="cal-day-agenda__body">
        <span className="cal-day-agenda__item-title">{task.title}</span>
        <span className="cal-day-agenda__meta">
          {SOURCE_LABELS[task.source] || 'Item'}
          {task.plant ? ` · ${task.plant}` : ''}
        </span>
      </div>
    </>
  )
  if (!to) {
    return <li className="cal-day-agenda__item" style={{ background: bg }}>{body}</li>
  }
  return (
    <li>
      <Link className="cal-day-agenda__item" style={{ background: bg }} to={to}>
        {body}
      </Link>
    </li>
  )
}

function CalendarTableRow({ task, priorityLabels }) {
  const to = useEventPath(task)
  const navigate = useNavigate()
  const clickable = to
    ? tableRowClickProps({
      onOpen: () => navigate(to),
      label: `Open ${task.title}`,
      className: 'cal-table__row--clickable',
    })
    : {}

  return (
    <tr {...clickable}>
      <td>{formatDisplayDate(task.date)}</td>
      <td>
        <span className="cal-table__title" title={task.title}>{task.title}</span>
      </td>
      <td>{task.plant}</td>
      <td>{SOURCE_LABELS[task.source] || task.type || '—'}</td>
      <td>
        {task.priority ? (
          <span className={`priority-badge priority-badge--${task.priority === 'followup' ? 'followup' : task.priority}`}>
            {priorityLabels[task.priority] || task.priority}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}

export function CalendarTable({ tasks, priorityLabels }) {
  return (
    <div className="cal-table-wrap">
      <table className="cal-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Item</th>
            <th>Location</th>
            <th>Type</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {!tasks?.length ? (
            <tr>
              <td colSpan={5} className="cal-table__empty">No scheduled items for this period.</td>
            </tr>
          ) : (
            tasks.map((task) => (
              <CalendarTableRow key={task.id} task={task} priorityLabels={priorityLabels} />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
