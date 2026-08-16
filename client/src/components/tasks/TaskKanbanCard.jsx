import { useMemo, memo } from 'react'
import { formatTaskDueShort, dueStatusClass } from '../../lib/taskDateUtils'
import { DUE_STATUS_LABELS } from '../../config/tasks'
import TaskAssigneeAvatars, { resolveTaskAssignees } from './TaskAssigneeAvatars'
import TaskPriorityIcon from './TaskPriorityIcon'
import { CommentIcon, AttachmentIcon, CalendarIcon } from './TaskCardIcons'

function hexToRgba(hex, alpha = 0.14) {
  const value = String(hex || '#6B7280').replace('#', '')
  if (value.length !== 6) return `rgba(107, 114, 128, ${alpha})`
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}


function TaskKanbanCard({ task, onOpen }) {
  const priorityColor = task.priority?.color || '#6B7280'
  const dueShort = formatTaskDueShort(task.due_date, task.due_time)
  const primaryTag = task.tags_list?.[0]?.name || task.category?.name || task.priority?.name || 'Task'
  const owners = resolveTaskAssignees({
    assignees: task.assignees,
    creator: task.creator,
    visibility_type: task.visibility_type,
  })
  const ownerLabel = owners[0]?.name
    || task.department?.name
    || task.location?.name
    || 'Assignee'

  const tagStyle = useMemo(() => ({
    color: priorityColor,
    background: hexToRgba(priorityColor, 0.14),
  }), [priorityColor])

  return (
    <button
      type="button"
      className="task-card"
      draggable
      onClick={() => onOpen?.(task)}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/task-id', task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
    >
      <div className="task-card__top">
        <div className="task-card__top-tags">
          {task.priority?.icon && (
            <span
              className="task-card__priority"
              title={task.priority?.name || 'Priority'}
              aria-label={task.priority?.name ? `Priority: ${task.priority.name}` : 'Priority'}
            >
              <TaskPriorityIcon
                icon={task.priority.icon}
                size={16}
                color={priorityColor}
              />
            </span>
          )}
          <span className="task-card__tag" style={tagStyle}>
            {primaryTag}
          </span>
          {task.due_status && task.due_status !== 'upcoming' && (
            <span className={`task-card__status ${dueStatusClass(task.due_status)}`}>
              {DUE_STATUS_LABELS[task.due_status]}
            </span>
          )}
          {(task.task_type === 'recurring' || task.parent_recurring_id) && (
            <span className="task-card__status task-badge--recurring">Recurring</span>
          )}
        </div>
        <div className="task-card__owner" aria-label={`Assigned to ${ownerLabel}`}>
          <TaskAssigneeAvatars
            assignees={task.assignees}
            creator={task.creator}
            visibility_type={task.visibility_type}
            department={task.department}
            location={task.location}
            variant="stack"
            avatarSize="md"
            showTooltip
            max={owners.length > 1 ? 2 : 1}
          />
        </div>
      </div>

      <h4 className="task-card__title">{task.title}</h4>

      {task.task_number && (
        <p className="task-card__desc task-card__number">{task.task_number}</p>
      )}

      {task.short_description && (
        <p className="task-card__desc">{task.short_description}</p>
      )}

      <div className="task-card__footer">
        <div className="task-card__stats">
          {dueShort && (
            <span className="task-card__stat" title="Due date">
              <CalendarIcon />
              {dueShort}
            </span>
          )}
          <span
            className={`task-card__stat${task.comment_count ? ' task-card__stat--active' : ''}`}
            title="Comments"
          >
            <CommentIcon />
            {task.comment_count || 0}
          </span>
          <span
            className={`task-card__stat${task.attachment_count ? ' task-card__stat--active' : ''}`}
            title="Attachments"
          >
            <AttachmentIcon />
            {task.attachment_count || 0}
          </span>
        </div>
      </div>
    </button>
  )
}

export default memo(TaskKanbanCard)
