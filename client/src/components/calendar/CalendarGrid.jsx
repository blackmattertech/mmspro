import { TASK_TYPE_COLORS, TASK_TYPE_BG } from '../../data/calendarDemo'
import { buildCalendarGrid } from '../../hooks/useCalendar'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRIORITY_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  followup: 'Follow-up',
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
}) {
  return (
    <div className="cal-filters">
      <div className="cal-filters__dropdowns">
        <FilterableSelect
          inputClassName="cal-filters__select"
          value={logFilter}
          onChange={onLogFilterChange}
          options={[
            { value: 'all', label: 'All Logs' },
            { value: 'logs', label: 'Logs Only' },
            { value: 'followups', label: 'Follow-ups Only' },
          ]}
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
        {[
          { key: 'high', label: 'High' },
          { key: 'medium', label: 'Medium' },
          { key: 'low', label: 'Low' },
          { key: 'followup', label: 'Follow-up' },
        ].map((item) => (
          <span key={item.key} className="cal-legend__item">
            <span
              className="cal-legend__dot"
              style={{ background: TASK_TYPE_COLORS[item.key] }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task }) {
  return (
    <div
      className="cal-task"
      style={{
        background: TASK_TYPE_BG[task.priority],
        borderLeftColor: TASK_TYPE_COLORS[task.priority],
      }}
    >
      <span className="cal-task__title">{task.title}</span>
      <span className="cal-task__plant">{task.plant}</span>
      <span className="cal-task__priority">
        <span
          className="cal-task__dot"
          style={{ background: TASK_TYPE_COLORS[task.priority] }}
        />
        {PRIORITY_LABELS[task.priority]}
      </span>
    </div>
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

export function CalendarTable({ tasks, priorityLabels }) {
  return (
    <div className="cal-table-wrap">
      <table className="cal-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Task</th>
            <th>Location</th>
            <th>Priority</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {!tasks?.length ? (
            <tr>
              <td colSpan={5} className="cal-table__empty">No tasks for this period.</td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr key={task.id}>
                <td>{new Date(task.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td>{task.title}</td>
                <td>{task.plant}</td>
                <td>
                  <span className={`priority-badge priority-badge--${task.priority === 'followup' ? 'followup' : task.priority}`}>
                    {priorityLabels[task.priority]}
                  </span>
                </td>
                <td>{task.type === 'followup' ? 'Follow-up' : 'Log'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
