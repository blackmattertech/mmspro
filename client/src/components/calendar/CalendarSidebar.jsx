import { QUICK_FILTERS } from '../../data/calendarDemo'
import { TASK_TYPE_COLORS } from '../../data/calendarDemo'

const FILTER_ICONS = {
  list: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 4H13M3 8H13M3 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  user: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 14C3 11.5 5.2 10 8 10C10.8 10 13 11.5 13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 3L14 13H2L8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 7V9.5M8 11.5V11.51" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 5.5V8L10 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5.5 8L7.5 10L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  flag: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 3V14M4 3H11L9.5 6L11 9H4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
}

const PRIORITY_BADGE_CLASS = {
  high: 'priority-badge--high',
  medium: 'priority-badge--medium',
  low: 'priority-badge--low',
  followup: 'priority-badge--followup',
}

export function QuickFilters({ active, onChange, counts }) {
  return (
    <div className="cal-panel">
      <h3 className="cal-panel__title">Quick Filters</h3>
      <ul className="cal-quick-filters">
        {QUICK_FILTERS.map((filter) => (
          <li key={filter.id}>
            <button
              type="button"
              className={`cal-quick-filters__item ${active === filter.id ? 'cal-quick-filters__item--active' : ''}`}
              onClick={() => onChange(filter.id)}
            >
              <span className="cal-quick-filters__icon">{FILTER_ICONS[filter.icon]}</span>
              <span className="cal-quick-filters__label">{filter.label}</span>
              <span className="cal-quick-filters__count">{counts[filter.id]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function UpcomingTasksPanel({ tasks, priorityLabels }) {
  return (
    <div className="cal-panel">
      <h3 className="cal-panel__title">Upcoming Tasks</h3>
      <ul className="cal-upcoming">
        {tasks.map((task) => (
          <li key={task.id} className="cal-upcoming__item">
            <div className="cal-upcoming__content">
              <span className="cal-upcoming__date">{task.date}</span>
              <span className="cal-upcoming__title">{task.title}</span>
              <span className="cal-upcoming__plant">{task.plant}</span>
            </div>
            <span className={`priority-badge ${PRIORITY_BADGE_CLASS[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TaskSummaryPanel({ summary }) {
  const radius = 56
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const arcs = summary.segments.filter((s) => s.count > 0).map((seg) => {
    const pct = seg.count / (summary.total || 1)
    const dash = pct * circumference
    const arc = { ...seg, dash, offset, color: TASK_TYPE_COLORS[seg.priority] }
    offset += dash
    return arc
  })

  return (
    <div className="cal-panel">
      <h3 className="cal-panel__title">Task Summary</h3>
      <div className="cal-summary">
        <div className="cal-summary__chart">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="18"/>
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth="18"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset + circumference / 4}
                transform="rotate(-90 70 70)"
              />
            ))}
          </svg>
          <div className="cal-summary__center">
            <span className="cal-summary__total">{summary.total}</span>
            <span className="cal-summary__label">Total Tasks</span>
          </div>
        </div>
        <div className="cal-summary__legend">
          {summary.segments.map((seg) => (
            <div key={seg.priority} className="cal-summary__legend-item">
              <span
                className="cal-summary__dot"
                style={{ background: TASK_TYPE_COLORS[seg.priority] }}
              />
              <span className="cal-summary__legend-label">{seg.label}</span>
              <span className="cal-summary__legend-value">{seg.count}</span>
              <span className="cal-summary__legend-pct">{seg.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
