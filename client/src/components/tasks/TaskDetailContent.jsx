import { useMemo, useState } from 'react'
import { formatTaskDateTimeDetail, dueStatusClass } from '../../lib/taskDateUtils'
import {
  DUE_STATUS_LABELS,
  VISIBILITY_OPTIONS,
  TASK_TYPE_OPTIONS,
  RECURRENCE_FREQUENCY_OPTIONS,
  REMINDER_OPTIONS,
  REFERENCE_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../../config/tasks'
import {
  formatTaskActivityFieldLabel,
  formatTaskActivityValue,
} from '../../lib/taskActivity'
import EmployeeAvatar from '../company/EmployeeAvatar'
import NavIcon from '../layout/NavIcon'
import { formatPhoneDisplay } from '../shared/PhoneInput'
import { CommentIcon, AttachmentIcon } from './TaskCardIcons'
import TaskAssigneeAvatars, { resolveTaskAssignees } from './TaskAssigneeAvatars'

const ACTIVITY_PREVIEW_COUNT = 5
const ATTACHMENT_PREVIEW_COUNT = 3
const REFERENCE_PREVIEW_COUNT = 4

function visibilityLabel(value) {
  return VISIBILITY_OPTIONS.find((opt) => opt.value === value)?.label || value
}

function taskTypeLabel(value) {
  return TASK_TYPE_OPTIONS.find((opt) => opt.value === value)?.label || value
}

function recurrenceLabel(value) {
  return RECURRENCE_FREQUENCY_OPTIONS.find((opt) => opt.value === value)?.label || value
}

function weekdayLabels(values = []) {
  return values
    .map((value) => WEEKDAY_OPTIONS.find((opt) => opt.value === Number(value))?.label)
    .filter(Boolean)
    .join(', ')
}

function formatRecurrenceSummary(recurrence) {
  if (!recurrence?.frequency) return '—'

  if (recurrence.frequency === 'custom') {
    const interval = recurrence.custom_interval || 1
    const unit = recurrence.custom_unit || 'days'
    return `Every ${interval} ${unit}`
  }

  return recurrenceLabel(recurrence.frequency)
}

function assignmentSummary(task) {
  if (task.visibility_type === 'department') {
    return task.department?.name || '—'
  }
  if (task.visibility_type === 'location') {
    return task.location?.name || '—'
  }

  const assignees = resolveTaskAssignees({
    assignees: task.assignees,
    creator: task.creator,
    visibility_type: task.visibility_type,
  })

  if (!assignees.length) return '—'
  return assignees.map((person) => person.name).join(', ')
}

function reminderLabel(value) {
  return REMINDER_OPTIONS.find((opt) => opt.value === value)?.label || value
}

function referenceTypeLabel(value) {
  return REFERENCE_TYPE_OPTIONS.find((opt) => opt.value === value)?.label || value
}

function profileLabel(person) {
  return person?.display_name || person?.full_name || person?.email || 'User'
}

function duePillVariant(status) {
  switch (status) {
    case 'overdue':
    case 'due_today':
      return 'danger'
    case 'due_soon':
      return 'warning'
    case 'completed_on_time':
      return 'success'
    default:
      return 'neutral'
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB'
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatActivityTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatActivityAction(actionType) {
  switch (actionType) {
    case 'task_created':
      return 'Task created'
    case 'attachment_added':
      return 'Attachment added'
    case 'attachment_deleted':
      return 'Attachment removed'
    case 'status_changed':
      return 'Status changed'
    case 'assignee_changed':
      return 'Assignees updated'
    case 'comment_added':
      return 'Comment added'
    case 'task_updated':
      return 'Task updated'
    default:
      return actionType?.replace(/_/g, ' ') || 'Updated'
  }
}

function DetailPill({ children, variant = 'primary' }) {
  return (
    <span className={`task-detail-pill task-detail-pill--${variant}`}>
      {children}
    </span>
  )
}

function DetailCard({ title, action, children, className = '' }) {
  return (
    <section className={`task-detail-card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="task-detail-card__head">
          {title && <h3 className="task-detail-card__title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

function DetailMetric({ label, value, children }) {
  return (
    <div className="task-detail-metric">
      <span className="task-detail-metric__label">{label}</span>
      <div className="task-detail-metric__value">
        {children ?? (value === null || value === undefined || value === '' ? '—' : value)}
      </div>
    </div>
  )
}

function AttachmentFileActions({ file }) {
  if (!file?.signed_url) return null

  return (
    <div className="task-detail-attachments__actions">
      <a
        href={file.signed_url}
        target="_blank"
        rel="noopener noreferrer"
        className="company-btn company-btn--secondary company-btn--compact company-btn--icon task-detail-attachments__action"
        aria-label={`View ${file.file_name}`}
        title="View"
      >
        <NavIcon name="view" />
      </a>
      <a
        href={file.signed_url}
        download={file.file_name || true}
        className="company-btn company-btn--secondary company-btn--compact company-btn--icon task-detail-attachments__action"
        aria-label={`Download ${file.file_name}`}
        title="Download"
      >
        <NavIcon name="download" />
      </a>
    </div>
  )
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.6 3h2.2l1.4 3.4-1.8 1.1a12.5 12.5 0 0 0 5.5 5.5l1.1-1.8L19.6 13v2.2a1.4 1.4 0 0 1-1.4 1.4C10.2 16.6 3.4 9.8 3.4 4.8A1.4 1.4 0 0 1 4.8 3.4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  )
}

export function TaskActivityTimeline({
  activities = [],
  statuses = [],
  priorities = [],
  limit,
}) {
  const visible = limit ? activities.slice(0, limit) : activities

  if (!visible.length) {
    return <div className="company-empty task-detail-empty">No activity yet.</div>
  }

  const lookup = { statuses, priorities }

  return (
    <div className="task-detail-activity">
      {visible.map((item) => {
        const attachmentName = item.action_type === 'attachment_added'
          ? formatTaskActivityValue(item.new_value, item.field_name, lookup)
          : null

        return (
          <div key={item.id} className="task-detail-activity__item">
            <span className="task-detail-activity__dot" />
            <div className="task-detail-activity__content">
              <div className="task-detail-activity__text">
                <strong>{formatActivityAction(item.action_type)}</strong>
                {attachmentName && (
                  <span className="task-detail-activity__sub">{attachmentName}</span>
                )}
                {!attachmentName && item.field_name && (
                  <span className="task-detail-activity__sub">
                    {formatTaskActivityFieldLabel(item.field_name)}
                    {': '}
                    {formatTaskActivityValue(item.new_value, item.field_name, lookup)}
                  </span>
                )}
                <span className="task-detail-activity__by">
                  by
                  {' '}
                  {profileLabel(item.actor)}
                </span>
              </div>
              <time className="task-detail-activity__time" dateTime={item.created_at}>
                {formatActivityTime(item.created_at)}
              </time>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TaskComments({ comments = [], onAdd, saving }) {
  const [body, setBody] = useState('')

  return (
    <div className="task-detail-comments">
      {comments.length > 0 && (
        <div className="task-detail-comments__list">
          {comments.map((comment) => (
            <div key={comment.id} className="task-detail-comments__item">
              <div className="task-detail-comments__meta">
                <strong>{profileLabel(comment.author)}</strong>
                <span>{formatActivityTime(comment.created_at)}</span>
              </div>
              <p className="task-detail-comments__text">{comment.body}</p>
            </div>
          ))}
        </div>
      )}
      <form
        className="task-detail-comments__form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!body.trim()) return
          await onAdd?.({ body })
          setBody('')
        }}
      >
        <textarea
          className="company-form__input task-detail-comments__input"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
        />
        <div className="task-detail-comments__actions">
          <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
            Post Comment
          </button>
        </div>
      </form>
    </div>
  )
}

export function TaskDetailContent({
  task,
  statuses,
  allStatuses = [],
  allPriorities = [],
  onStatusChange,
  onAddComment,
  saving,
}) {
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [showAllAttachments, setShowAllAttachments] = useState(false)
  const [showAllReferences, setShowAllReferences] = useState(false)

  const attachments = task?.task_attachments || []
  const references = task?.task_references || []
  const links = task?.task_links || []
  const activities = task?.task_activities || []
  const assignees = resolveTaskAssignees({
    assignees: task?.assignees,
    creator: task?.creator,
    visibility_type: task?.visibility_type,
  })
  const primaryAssignee = assignees[0] || null
  const tags = task?.tags_list || []
  const recurrence = task?.recurrence || null

  const referenceRows = useMemo(() => {
    const rows = references.map((ref) => ({
      id: ref.id,
      type: referenceTypeLabel(ref.reference_type),
      number: ref.reference_number || '—',
      label: ref.reference_label || '—',
      link: '—',
    }))
    links.forEach((link) => {
      rows.push({
        id: link.id,
        type: 'External link',
        number: link.title || '—',
        label: '—',
        link: link.url,
      })
    })
    return rows
  }, [references, links])

  const visibleAttachments = showAllAttachments
    ? attachments
    : attachments.slice(0, ATTACHMENT_PREVIEW_COUNT)
  const visibleReferences = showAllReferences
    ? referenceRows
    : referenceRows.slice(0, REFERENCE_PREVIEW_COUNT)
  const visibleActivities = showAllActivity
    ? activities
    : activities.slice(0, ACTIVITY_PREVIEW_COUNT)

  if (!task) return null

  const isRecurring = task.task_type === 'recurring' || Boolean(recurrence)
  const priorityColor = task.priority?.color || 'var(--color-primary)'
  const recurrenceWeekdays = weekdayLabels(recurrence?.weekdays)

  return (
    <div className="task-detail-layout">
      <div className="task-detail-main">
        <DetailCard title="Overview">
          <div className="task-detail-overview">
            <div className="task-detail-overview__top">
              <div className="task-detail-overview__meta">
                <DetailMetric label="Task Number" value={task.task_number} />
                <DetailMetric label="Task Title" value={task.title} />
                <DetailMetric label="Category">
                  {task.category?.name
                    ? <DetailPill>{task.category.name}</DetailPill>
                    : '—'}
                </DetailMetric>
                <DetailMetric label="Visibility">
                  <DetailPill>{visibilityLabel(task.visibility_type)}</DetailPill>
                </DetailMetric>
                <DetailMetric label="Recurring Task">
                  <DetailPill variant={isRecurring ? 'success' : 'neutral'}>
                    {taskTypeLabel(isRecurring ? 'recurring' : 'one_time')}
                  </DetailPill>
                </DetailMetric>
              </div>
              <div className="task-detail-overview__descriptions">
                <DetailMetric label="Short Description" value={task.short_description} />
                <DetailMetric label="Detailed Description" value={task.detailed_description} />
              </div>
            </div>

            <div className="task-detail-overview__row">
              <DetailMetric label="Priority">
                <span className="task-detail-priority" style={{ color: priorityColor }}>
                  {task.priority?.name || '—'}
                </span>
              </DetailMetric>
              <DetailMetric label="Status">
                {task.status?.name
                  ? <DetailPill variant="neutral">{task.status.name}</DetailPill>
                  : '—'}
              </DetailMetric>
              <DetailMetric label="Department" value={task.department?.name} />
              <DetailMetric label="Location" value={task.location?.name} />
            </div>

            <div className="task-detail-overview__row task-detail-overview__row--2">
              <DetailMetric label="Vendor / Contractor" value={task.vendor?.name} />
              <DetailMetric label="Assigned By" value={task.assigned_by_name} />
            </div>

            <div className="task-detail-overview__row task-detail-overview__row--2">
              <DetailMetric label="Assigned To" value={assignmentSummary(task)} />
              <DetailMetric label="Tags">
                {tags.length > 0 ? (
                  <div className="task-detail-tags">
                    {tags.map((tag) => (
                      <DetailPill key={tag.id}>{tag.name}</DetailPill>
                    ))}
                  </div>
                ) : '—'}
              </DetailMetric>
            </div>
          </div>
        </DetailCard>

        <DetailCard title="Schedule">
          <div className="task-detail-schedule">
            <div className="task-detail-schedule__grid">
              <DetailMetric
                label="Start"
                value={formatTaskDateTimeDetail(task.start_date, task.start_time)}
              />
              <DetailMetric
                label="Due"
                value={formatTaskDateTimeDetail(task.due_date, task.due_time)}
              />
              <DetailMetric label="Due Status">
                {task.due_status
                  ? (
                    <DetailPill variant={duePillVariant(task.due_status)}>
                      {DUE_STATUS_LABELS[task.due_status]}
                    </DetailPill>
                  )
                  : '—'}
              </DetailMetric>
              <DetailMetric
                label="Recurrence"
                value={isRecurring ? formatRecurrenceSummary(recurrence) : '—'}
              />
              <DetailMetric
                label="Next Due"
                value={recurrence?.next_occurrence_at
                  ? formatActivityTime(recurrence.next_occurrence_at)
                  : '—'}
              />
              {isRecurring && recurrenceWeekdays && (
                <DetailMetric label="Repeat On" value={recurrenceWeekdays} />
              )}
              {isRecurring && recurrence?.recurrence_start_date && (
                <DetailMetric
                  label="Recurrence Start"
                  value={formatTaskDateTimeDetail(recurrence.recurrence_start_date, null)}
                />
              )}
              {isRecurring && (
                <DetailMetric
                  label="Recurrence End"
                  value={recurrence?.never_ends
                    ? 'Never ends'
                    : formatTaskDateTimeDetail(recurrence?.recurrence_end_date, null)}
                />
              )}
            </div>
            {(task.task_reminders || []).length > 0 && (
              <div className="task-detail-reminders">
                {(task.task_reminders || []).map((reminder) => (
                  <span key={reminder.id} className="task-detail-reminder-pill">
                    {reminderLabel(reminder.reminder_type)}
                    {reminder.remind_at && (
                      <span className="task-detail-reminder-pill__time">
                        {formatActivityTime(reminder.remind_at)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </DetailCard>

        {(task.follow_up_remarks || task.next_action || task.completion_remarks) && (
          <DetailCard title="Task Updates">
            <div className="task-detail-updates">
              <DetailMetric label="Follow-up Remarks" value={task.follow_up_remarks} />
              <DetailMetric label="Next Action" value={task.next_action} />
              <DetailMetric label="Completion Remarks" value={task.completion_remarks} />
            </div>
          </DetailCard>
        )}

        <div className="task-detail-split">
          <DetailCard title="Attachments">
            {attachments.length === 0 ? (
              <div className="company-empty task-detail-empty">No attachments.</div>
            ) : (
              <>
                <ul className="task-detail-attachments">
                  {visibleAttachments.map((file) => (
                    <li key={file.id} className="task-detail-attachments__item">
                      <div className="task-detail-attachments__meta">
                        <span className="task-detail-attachments__name">{file.file_name}</span>
                        <span className="task-detail-attachments__size">
                          {formatFileSize(file.file_size)}
                          {file.content_type ? ` · ${file.content_type.split('/').pop()?.toUpperCase()}` : ''}
                        </span>
                      </div>
                      <AttachmentFileActions file={file} />
                    </li>
                  ))}
                </ul>
                {attachments.length > ATTACHMENT_PREVIEW_COUNT && (
                  <button
                    type="button"
                    className="task-detail-link task-detail-link--button"
                    onClick={() => setShowAllAttachments((value) => !value)}
                  >
                    {showAllAttachments ? 'Show fewer' : 'View all attachments'}
                  </button>
                )}
              </>
            )}
          </DetailCard>

          <DetailCard
            title="References & Links"
            action={referenceRows.length > REFERENCE_PREVIEW_COUNT && (
              <button
                type="button"
                className="task-detail-link task-detail-link--button"
                onClick={() => setShowAllReferences((value) => !value)}
              >
                {showAllReferences ? 'Show fewer' : 'View all'}
              </button>
            )}
          >
            {referenceRows.length === 0 ? (
              <div className="company-empty task-detail-empty">No references or links.</div>
            ) : (
              <div className="task-detail-table-wrap">
                <table className="task-detail-table">
                  <thead>
                    <tr>
                      <th>Reference Type</th>
                      <th>Reference Number</th>
                      <th>Label</th>
                      <th>External Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReferences.map((row) => (
                      <tr key={row.id}>
                        <td>{row.type}</td>
                        <td>{row.number}</td>
                        <td>{row.label}</td>
                        <td>
                          {row.link && row.link !== '—' ? (
                            <a
                              href={row.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="task-detail-link"
                            >
                              {row.link}
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailCard>
        </div>

        <DetailCard title="Comments">
          <TaskComments
            comments={task.task_comments}
            onAdd={onAddComment}
            saving={saving}
          />
        </DetailCard>
      </div>

      <aside className="task-detail-sidebar">
        <DetailCard title="Status">
          <label className="task-detail-status-field">
            <select
              className="company-form__input task-detail-status-select"
              value={task.status_id}
              disabled={saving}
              onChange={(e) => onStatusChange?.(e.target.value)}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
          </label>
          <div className="task-detail-side-stats">
            <span className="task-detail-side-stats__item">
              <CommentIcon />
              {(task.task_comments || []).length}
              {' '}
              comments
            </span>
            <span className="task-detail-side-stats__divider" aria-hidden="true">|</span>
            <span className="task-detail-side-stats__item">
              <AttachmentIcon />
              {attachments.length}
              {' '}
              files
            </span>
          </div>
        </DetailCard>

        <DetailCard
          title="Activity"
          action={activities.length > ACTIVITY_PREVIEW_COUNT && (
            <button
              type="button"
              className="task-detail-link task-detail-link--button"
              onClick={() => setShowAllActivity((value) => !value)}
            >
              {showAllActivity ? 'Show fewer' : 'View all'}
            </button>
          )}
        >
          <TaskActivityTimeline
            activities={visibleActivities}
            statuses={allStatuses.length ? allStatuses : statuses}
            priorities={allPriorities}
          />
        </DetailCard>

        <DetailCard className="task-detail-card--assignee">
          {task.due_status && (
            <span className={`task-detail-assignee-due ${dueStatusClass(task.due_status)}`}>
              {DUE_STATUS_LABELS[task.due_status]}
            </span>
          )}
          <h3 className="task-detail-card__title task-detail-card__title--inline">Assigned To</h3>
          {task.visibility_type === 'department' || task.visibility_type === 'location' ? (
            <TaskAssigneeAvatars
              assignees={task.assignees}
              creator={task.creator}
              visibility_type={task.visibility_type}
              department={task.department}
              location={task.location}
              variant="list"
              avatarSize="md"
            />
          ) : assignees.length > 1 ? (
            <TaskAssigneeAvatars
              assignees={task.assignees}
              creator={task.creator}
              visibility_type={task.visibility_type}
              variant="list"
              avatarSize="md"
              max={8}
            />
          ) : primaryAssignee ? (
            <div className="task-detail-assignee">
              <EmployeeAvatar employee={primaryAssignee} />
              <div className="task-detail-assignee__info">
                <strong>{primaryAssignee.name}</strong>
                <span>{primaryAssignee.emp_id || task.department?.name || 'Team member'}</span>
              </div>
              <div className="task-detail-assignee__actions">
                {primaryAssignee.mobile && (
                  <a
                    href={`tel:${primaryAssignee.mobile}`}
                    className="task-detail-assignee__icon-btn"
                    aria-label={`Call ${primaryAssignee.name}`}
                    title={formatPhoneDisplay(primaryAssignee.mobile)}
                  >
                    <PhoneIcon />
                  </a>
                )}
                {primaryAssignee.email && (
                  <a
                    href={`mailto:${primaryAssignee.email}`}
                    className="task-detail-assignee__icon-btn"
                    aria-label={`Email ${primaryAssignee.name}`}
                    title={primaryAssignee.email}
                  >
                    <MailIcon />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="company-empty task-detail-empty">No assignee.</div>
          )}
        </DetailCard>
      </aside>
    </div>
  )
}
