import { formatDayTabLabel } from '../../lib/workOrderDaySnapshot'

export default function WorkOrderDayTabs({
  logs = [],
  activeLogId,
  todayLogId = null,
  showNewToday = false,
  newTodayActive = false,
  onSelect,
}) {
  if (!logs.length && !showNewToday) return null

  return (
    <div className="wo-day-tabs" role="tablist" aria-label="Work days">
      {showNewToday ? (
        <button
          type="button"
          role="tab"
          aria-selected={newTodayActive}
          className={`wo-day-tabs__tab is-today${newTodayActive ? ' is-active' : ''}`}
          onClick={() => onSelect?.(null)}
        >
          <span className="wo-day-tabs__date">Today</span>
          <span className="wo-day-tabs__badge">New</span>
        </button>
      ) : null}
      {logs.map((log) => {
        const selected = !newTodayActive && log.id === activeLogId
        const isToday = Boolean(todayLogId && log.id === todayLogId)
        return (
          <button
            key={log.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`wo-day-tabs__tab${selected ? ' is-active' : ''}${isToday ? ' is-today' : ''}`}
            onClick={() => onSelect?.(log.id)}
          >
            <span className="wo-day-tabs__date">{formatDayTabLabel(log)}</span>
            {isToday ? <span className="wo-day-tabs__badge">Today</span> : null}
          </button>
        )
      })}
    </div>
  )
}
