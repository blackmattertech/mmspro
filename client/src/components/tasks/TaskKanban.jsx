import { useState } from 'react'
import { changeTaskStatus } from '../../lib/api-tasks'
import TaskKanbanCard from './TaskKanbanCard'

export default function TaskKanban({
  board,
  onOpenTask,
  onStatusChanged,
}) {
  const [dragOverStatusId, setDragOverStatusId] = useState(null)
  const [moving, setMoving] = useState(false)

  const handleDrop = async (statusId, event) => {
    event.preventDefault()
    setDragOverStatusId(null)
    const taskId = event.dataTransfer.getData('text/task-id')
    if (!taskId || moving || statusId === '__unknown__') return

    const column = board?.columns?.find((col) => col.status.id === statusId)
    const alreadyThere = column?.tasks?.some((task) => task.id === taskId)
    if (alreadyThere) return

    setMoving(true)
    try {
      await changeTaskStatus(taskId, statusId)
      onStatusChanged?.()
    } catch (err) {
      window.alert(err.message)
    } finally {
      setMoving(false)
    }
  }

  if (!board?.columns?.length) {
    return <div className="company-empty">No statuses configured yet.</div>
  }

  return (
    <div
      className="tasks-kanban"
      style={{ '--kanban-columns': board.columns.length }}
    >
      {board.columns.map((column) => (
          <section key={column.status.id} className="tasks-kanban__column">
            <header className="tasks-kanban__column-header">
              <h3 className="tasks-kanban__column-title">
                <span
                  className="tasks-kanban__column-dot"
                  style={{ background: column.status.color || '#6B7280' }}
                />
                <span className="tasks-kanban__column-name">{column.status.name}</span>
              </h3>
              <span className="tasks-kanban__column-count">{column.tasks.length}</span>
            </header>
            <div
              className={`tasks-kanban__column-body${dragOverStatusId === column.status.id ? ' tasks-kanban__column-body--over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOverStatusId(column.status.id)
              }}
              onDragLeave={() => setDragOverStatusId(null)}
              onDrop={(event) => handleDrop(column.status.id, event)}
            >
              {column.tasks.map((task) => (
                <TaskKanbanCard key={task.id} task={task} onOpen={onOpenTask} />
              ))}
              {!column.tasks.length && (
                <div className="tasks-kanban__empty">Drop tasks here</div>
              )}
            </div>
          </section>
        ))}
    </div>
  )
}
