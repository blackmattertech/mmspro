import { useMemo } from 'react'

function buildPriorityProgress(board) {
  const groups = new Map()

  for (const column of board?.columns || []) {
    for (const task of column.tasks || []) {
      const key = task.priority?.id || 'none'
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          name: task.priority?.name || 'No priority',
          color: task.priority?.color || '#6B7280',
          total: 0,
          done: 0,
        })
      }
      const entry = groups.get(key)
      entry.total += 1
      if (task.status?.is_terminal) entry.done += 1
    }
  }

  return [...groups.values()].sort((a, b) => b.total - a.total)
}

function buildStatusSummary(board) {
  return (board?.columns || []).map((column) => ({
    id: column.status.id,
    count: column.tasks.length,
    isTerminal: column.status.is_terminal,
  }))
}

export default function TaskKanbanProgress({ board }) {
  const priorityProgress = useMemo(() => buildPriorityProgress(board), [board])
  const statusSummary = useMemo(() => buildStatusSummary(board), [board])

  const totalTasks = statusSummary.reduce((sum, item) => sum + item.count, 0)
  const doneTasks = statusSummary
    .filter((item) => item.isTerminal)
    .reduce((sum, item) => sum + item.count, 0)

  if (!board?.columns?.length) return null

  return (
    <section className="tasks-kanban-progress" aria-label="Task progress">
      <div className="tasks-kanban-progress__summary">
        <span className="tasks-kanban-progress__title">Task progress</span>
        <span className="tasks-kanban-progress__value">{doneTasks}/{totalTasks}</span>
        <span className="tasks-kanban-progress__label">completed</span>
      </div>

      {priorityProgress.length === 0 ? (
        <p className="tasks-kanban-progress__empty">No tasks yet.</p>
      ) : (
        <ul className="tasks-kanban-progress__list">
          {priorityProgress.map((item) => {
            const percent = item.total ? Math.round((item.done / item.total) * 100) : 0
            return (
              <li key={item.id} className="tasks-kanban-progress__item">
                <span className="tasks-kanban-progress__name">{item.name}</span>
                <div className="tasks-kanban-progress__track">
                  <span
                    className="tasks-kanban-progress__fill"
                    style={{ width: `${percent}%`, background: item.color }}
                  />
                </div>
                <span className="tasks-kanban-progress__count">{item.done}/{item.total}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
