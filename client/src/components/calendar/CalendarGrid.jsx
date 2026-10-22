import { Link, useNavigate } from 'react-router-dom'
import { EVENT_SOURCE_COLORS, EVENT_SOURCE_BG, SOURCE_FILTERS, SOURCE_LABELS, LEGEND_ITEMS, eventColorKey } from '../../data/calendarDemo'
import { buildCalendarGrid } from '../../hooks/useCalendar'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { calendarEventPath } from '../../lib/calendarEventPath'
import { tableRowClickProps } from '../../lib/clickableTableRow'
import FilterableSelect from '../ui/FilterableSelect'

function useEventPath(task) {
  const { org } = useOrg()
  const { canRead } = usePermissions()
  return calendarEventPath(org?.slug, task, canRead)
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarFilters({
  logFilter,
  onLogFilterChange,
  plantFilter,
  onPlantFilterChange,
  workCenterFilter,
  onWorkCenterFilterChange,
  plants,
  workCenters,
}) {
  return (
    <div className="cal-filters">
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

function TaskCard({ task }) {
  const colorKey = eventColorKey(task)
  const to = useEventPath(task)
  const label = `${SOURCE_LABELS[task.source] || 'Item'}: ${task.title}`
  const body = (
    <>
      <span className="cal-task__title">{task.title}</span>
      <span className="cal-task__plant">{task.plant}</span>
      <span className="cal-task__priority">
        <span
          className="cal-task__dot"
          style={{ background: EVENT_SOURCE_COLORS[colorKey] || EVENT_SOURCE_COLORS.task }}
        />
        {SOURCE_LABELS[task.source] || task.status_label || 'Item'}
      </span>
    </>
  )
  const style = {
    background: EVENT_SOURCE_BG[colorKey] || EVENT_SOURCE_BG.task,
    borderLeftColor: EVENT_SOURCE_COLORS[colorKey] || EVENT_SOURCE_COLORS.task,
  }
  if (!to) {
    return (
      <div className="cal-task" style={style} title={label}>
        {body}
      </div>
    )
  }
  return (
    <Link className="cal-task" style={style} title={label} to={to}>
      {body}
    </Link>
  )
}

export function CalendarGrid({ year, month, tasksByDate, todayDay = 28 }) {
  const cells = buildCalendarGrid(year, month)

  return (
    <div className="cal-grid">
      <div className="cal-grid__weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day} className="cal-grid__weekday">{day}</span>
        ))}
      </div>
      <div className="cal-grid__cells">
        {cells.map((cell, i) => {
          const tasks = cell.currentMonth ? (tasksByDate[cell.day] || []) : []
          const isToday = cell.currentMonth && cell.day === todayDay

          return (
            <div
              key={i}
              className={`cal-grid__cell ${!cell.currentMonth ? 'cal-grid__cell--other' : ''}`}
            >
              <span className={`cal-grid__day ${isToday ? 'cal-grid__day--today' : ''}`}>
                {cell.day}
              </span>
              <div className="cal-grid__tasks">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
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
      <td>{new Date(`${String(task.date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td>{task.title}</td>
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
