import { formatTaskDateTimeDetail } from '../../lib/taskDateUtils'
import './TaskReminderModal.css'

export default function TaskReminderModal({ reminder, onDismiss, onOpen }) {
  if (!reminder) return null

  const dueLabel = formatTaskDateTimeDetail(reminder.due_date, reminder.due_time)

  return (
    <div
      className="company-modal-overlay company-modal-overlay--popup task-reminder-overlay"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className="company-modal company-modal--popup task-reminder-modal"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-labelledby="task-reminder-title"
        aria-describedby="task-reminder-body"
      >
        <div className="task-reminder-modal__header">
          <span className="task-reminder-modal__badge">Reminder</span>
          <h2 id="task-reminder-title" className="task-reminder-modal__title">
            {reminder.task_number ? `${reminder.task_number}: ` : ''}
            {reminder.title || 'Task reminder'}
          </h2>
        </div>

        <div id="task-reminder-body" className="task-reminder-modal__body">
          <p className="task-reminder-modal__due">
            Due {dueLabel === '—' ? 'soon' : dueLabel}
          </p>
          {reminder.short_description ? (
            <p className="task-reminder-modal__summary">{reminder.short_description}</p>
          ) : (
            <p className="task-reminder-modal__summary">This task reminder is due now.</p>
          )}
        </div>

        <div className="company-modal__actions task-reminder-modal__actions">
          <button type="button" className="company-btn company-btn--secondary" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" className="company-btn company-btn--primary" onClick={onOpen}>
            Open task
          </button>
        </div>
      </div>
    </div>
  )
}
