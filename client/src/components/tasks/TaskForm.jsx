import { useEffect, useMemo, useRef, useState } from 'react'
import DateField from '../ui/DateField'
import TimeField from '../ui/TimeField'
import FilterableSelect from '../ui/FilterableSelect'
import EmployeeAvatar from '../company/EmployeeAvatar'
import NavIcon from '../layout/NavIcon'
import {
  VISIBILITY_OPTIONS,
  TASK_TYPE_OPTIONS,
  RECURRENCE_FREQUENCY_OPTIONS,
  REMINDER_OPTIONS,
  REFERENCE_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
} from '../../config/tasks'
import '../company/CompanyShared.css'
import './Tasks.css'
import TaskAttachmentsSection from './TaskAttachmentsSection'

export const EMPTY_TASK_FORM = {
  task_number: '',
  title: '',
  short_description: '',
  detailed_description: '',
  visibility_type: 'self',
  task_type: 'one_time',
  status_id: '',
  priority_id: '',
  category_id: '',
  vendor_id: '',
  start_date: '',
  start_time: '',
  due_date: '',
  due_time: '',
  department_id: '',
  location_id: '',
  assignee_employee_ids: [],
  tag_ids: [],
  reminders: [],
  links: [{ title: '', url: '' }],
  references: [{ reference_type: 'work_order', reference_number: '', reference_label: '', reference_entity_id: '' }],
  follow_up_remarks: '',
  next_action: '',
  completion_remarks: '',
  attachments: [],
  removedAttachmentIds: [],
  recurrence: {
    frequency: 'weekly',
    custom_interval: 1,
    custom_unit: 'weeks',
    weekdays: [],
    recurrence_start_date: '',
    recurrence_end_date: '',
    never_ends: false,
  },
}

function FormSection({ title, description, children }) {
  return (
    <section className="task-form__section">
      <div className="task-form__section-head">
        <h3 className="task-form__section-title">{title}</h3>
        {description && <p className="task-form__section-desc">{description}</p>}
      </div>
      <div className="task-form__section-body">
        {children}
      </div>
    </section>
  )
}

function FormField({
  label,
  required = false,
  fullWidth = false,
  hint,
  children,
}) {
  return (
    <label className={`company-form__field${fullWidth ? ' company-form__field--full' : ''}`}>
      {label && (
        <span className="company-form__label">
          {label}
          {required ? ' *' : ''}
        </span>
      )}
      {children}
      {hint && <span className="task-form__hint">{hint}</span>}
    </label>
  )
}

function DateTimeRow({ dateLabel, dateValue, onDateChange, timeLabel, timeValue, onTimeChange }) {
  return (
    <div className="task-form__datetime-row">
      <FormField label={dateLabel}>
        <DateField value={dateValue} onChange={onDateChange} />
      </FormField>
      <FormField label={timeLabel}>
        <TimeField value={timeValue} onChange={onTimeChange} />
      </FormField>
    </div>
  )
}

function MetaSelect({ label, value, onChange, options, placeholder = 'Default' }) {
  const selected = options.find((opt) => opt.id === value)

  return (
    <FormField label={label}>
      <div className="task-form__meta-select">
        {selected?.color && (
          <span
            className="task-form__meta-swatch"
            style={{ background: selected.color }}
            aria-hidden="true"
          />
        )}
        <select
          className="company-form__input task-form__meta-select-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      </div>
    </FormField>
  )
}

function TeamMemberPicker({ members, selectedIds, onChange }) {
  if (!members?.length) {
    return <div className="company-empty task-form__empty-assignees">No team members in your department.</div>
  }

  return (
    <div className="task-assignee-grid">
      {members.map((employee) => {
        const checked = selectedIds.includes(employee.id)
        return (
          <button
            key={employee.id}
            type="button"
            className={`task-assignee-card${checked ? ' task-assignee-card--selected' : ''}`}
            onClick={() => {
              const next = new Set(selectedIds)
              if (checked) next.delete(employee.id)
              else next.add(employee.id)
              onChange([...next])
            }}
            aria-pressed={checked}
          >
            <EmployeeAvatar employee={employee} size="sm" />
            <span className="task-assignee-card__text">
              <span className="task-assignee-card__name">{employee.name}</span>
              {employee.emp_id && (
                <span className="task-assignee-card__meta">{employee.emp_id}</span>
              )}
            </span>
            <span className={`task-assignee-card__check${checked ? ' task-assignee-card__check--on' : ''}`} aria-hidden="true">
              {checked ? '✓' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function employeeForAvatar(employee, fallbackName, avatarUrl) {
  const displayName = employee?.name || fallbackName || 'You'
  if (employee) {
    return {
      ...employee,
      name: displayName,
      photo_signed_url: avatarUrl || employee.photo_signed_url || null,
    }
  }
  return {
    name: displayName,
    photo_signed_url: avatarUrl || null,
  }
}

function EmployeeAssigneeCard({ employee, fallbackName, avatarUrl, badge }) {
  const displayName = employee?.name || fallbackName || 'You'

  return (
    <div className="task-assignee-card task-assignee-card--static task-assignee-card--field">
      <EmployeeAvatar
        employee={employeeForAvatar(employee, fallbackName, avatarUrl)}
        size="sm"
      />
      <span className="task-assignee-card__text">
        <span className="task-assignee-card__name">{displayName}</span>
        {employee?.emp_id && (
          <span className="task-assignee-card__meta">{employee.emp_id}</span>
        )}
      </span>
      {badge}
    </div>
  )
}

function AssignedByDisplay({ employee, fallbackName, avatarUrl }) {
  return (
    <EmployeeAssigneeCard
      employee={employee}
      fallbackName={fallbackName}
      avatarUrl={avatarUrl}
    />
  )
}

function SelfAssigneeCard({ employee, fallbackName, avatarUrl }) {
  if (!employee && !fallbackName) {
    return <div className="task-form__self-note">This task will be assigned to you.</div>
  }

  return (
    <EmployeeAssigneeCard
      employee={employee}
      fallbackName={fallbackName}
      avatarUrl={avatarUrl}
      badge={<span className="company-badge company-badge--primary">You</span>}
    />
  )
}

export default function TaskForm({
  values,
  onChange,
  statuses,
  priorities,
  categories,
  tags,
  vendors,
  departments,
  locations,
  teamMembers,
  currentEmployee,
  currentUserName,
  currentUserAvatar,
  isEdit = false,
  saving,
  onSubmit,
  submitLabel = 'Save Task',
  onCreateTag,
}) {
  const [reminderType, setReminderType] = useState('7d')
  const [customReminderMinutes, setCustomReminderMinutes] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [tagError, setTagError] = useState(null)
  const [showTagInput, setShowTagInput] = useState(false)
  const tagInputRef = useRef(null)

  const departmentOptions = useMemo(
    () => (departments || []).map((d) => ({ value: d.id, label: d.name })),
    [departments],
  )

  const locationOptions = useMemo(
    () => (locations || []).map((l) => ({ value: l.id, label: l.name })),
    [locations],
  )

  const setField = (field, value) => onChange({ ...values, [field]: value })

  useEffect(() => {
    if (showTagInput) {
      tagInputRef.current?.focus()
    }
  }, [showTagInput])

  const closeTagInput = () => {
    setShowTagInput(false)
    setNewTagName('')
    setTagError(null)
  }

  const addReminder = () => {
    const entry = {
      reminder_type: reminderType,
      custom_minutes_before: reminderType === 'custom' ? Number(customReminderMinutes) : null,
    }
    setField('reminders', [...(values.reminders || []), entry])
  }

  const removeReminder = (index) => {
    setField('reminders', (values.reminders || []).filter((_, i) => i !== index))
  }

  const updateLink = (index, field, value) => {
    const links = [...(values.links || [])]
    links[index] = { ...links[index], [field]: value }
    setField('links', links)
  }

  const addLink = () => setField('links', [...(values.links || []), { title: '', url: '' }])

  const updateReference = (index, field, value) => {
    const refs = [...(values.references || [])]
    refs[index] = { ...refs[index], [field]: value }
    setField('references', refs)
  }

  const addReference = () => setField('references', [
    ...(values.references || []),
    { reference_type: 'custom', reference_number: '', reference_label: '', reference_entity_id: '' },
  ])

  const toggleTag = (tagId) => {
    const current = new Set(values.tag_ids || [])
    if (current.has(tagId)) current.delete(tagId)
    else current.add(tagId)
    setField('tag_ids', [...current])
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name || creatingTag) return

    const existing = (tags || []).find(
      (tag) => tag.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      const current = new Set(values.tag_ids || [])
      current.add(existing.id)
      setField('tag_ids', [...current])
      closeTagInput()
      return
    }

    if (!onCreateTag) {
      setTagError('You do not have permission to create tags.')
      return
    }

    setCreatingTag(true)
    setTagError(null)
    try {
      const created = await onCreateTag({ name })
      const current = new Set(values.tag_ids || [])
      current.add(created.id)
      setField('tag_ids', [...current])
      closeTagInput()
    } catch (err) {
      setTagError(err.message || 'Could not create tag.')
    } finally {
      setCreatingTag(false)
    }
  }

  const toggleWeekday = (day) => {
    const current = new Set(values.recurrence?.weekdays || [])
    if (current.has(day)) current.delete(day)
    else current.add(day)
    setField('recurrence', { ...values.recurrence, weekdays: [...current] })
  }

  const categoryOptions = useMemo(
    () => (categories || []).map((c) => ({ value: c.id, label: c.name })),
    [categories],
  )

  const vendorOptions = useMemo(
    () => (vendors || []).map((v) => ({ value: v.id, label: `${v.vendor_code} — ${v.name}` })),
    [vendors],
  )

  const openStatus = statuses.find((s) => s.name === 'Open')

  return (
    <form className="task-form company-form" onSubmit={onSubmit}>
      <FormSection
        title="Section A — General Information"
        description="Core details, classification, and visibility."
      >
        <div className="company-form__grid task-form__grid">
          {isEdit && values.task_number && (
            <FormField label="Task Number" fullWidth>
              <input className="company-form__input" value={values.task_number} readOnly disabled />
            </FormField>
          )}

          <div className="task-form__field-row task-form__field-row--2 company-form__field--full">
            <FormField label="Task Title" required>
              <input
                className="company-form__input"
                value={values.title}
                onChange={(e) => setField('title', e.target.value)}
                required
              />
            </FormField>

            <FormField label="Short Description">
              <input
                className="company-form__input"
                value={values.short_description}
                onChange={(e) => setField('short_description', e.target.value)}
                placeholder="Brief summary shown on cards and lists"
              />
            </FormField>
          </div>

          <FormField label="Detailed Description" required fullWidth>
            <textarea
              className="company-form__input company-form__textarea"
              rows={5}
              value={values.detailed_description}
              onChange={(e) => setField('detailed_description', e.target.value)}
              placeholder="Full task details, instructions, and context"
              required
            />
          </FormField>

          <div className="task-form__field-row task-form__field-row--5 company-form__field--full">
            <FormField label="Category" required>
              <FilterableSelect
                value={values.category_id}
                onChange={(id) => setField('category_id', id)}
                options={categoryOptions}
                placeholder="Select category"
              />
            </FormField>

            <FormField label="Task Type" required>
              <select
                className="company-form__input"
                value={values.visibility_type}
                onChange={(e) => setField('visibility_type', e.target.value)}
              >
                {VISIBILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>

            <MetaSelect
              label="Priority"
              value={values.priority_id}
              onChange={(v) => setField('priority_id', v)}
              options={priorities}
              placeholder="Select priority"
            />

            {!isEdit ? (
              <FormField label="Status">
                <input
                  className="company-form__input"
                  value={openStatus?.name || 'Open'}
                  readOnly
                  disabled
                />
              </FormField>
            ) : (
              <MetaSelect
                label="Status"
                value={values.status_id}
                onChange={(v) => setField('status_id', v)}
                options={statuses}
              />
            )}

            <FormField label="Recurring Task">
              <select
                className="company-form__input"
                value={values.task_type}
                onChange={(e) => setField('task_type', e.target.value)}
              >
                {TASK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            label="Task Tags"
            fullWidth
            hint={showTagInput ? 'Type a tag name and press Enter' : 'Select one or more tags'}
          >
            <div className="task-tag-picker">
              {(tags || []).map((tag) => {
                const selected = (values.tag_ids || []).includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`task-tag-picker__chip${selected ? ' task-tag-picker__chip--selected' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={selected}
                  >
                    {tag.name}
                  </button>
                )
              })}
              {showTagInput ? (
                <div className="task-tag-picker__create">
                  <input
                    ref={tagInputRef}
                    type="text"
                    className="company-form__input task-tag-picker__create-input"
                    value={newTagName}
                    onChange={(e) => {
                      setNewTagName(e.target.value)
                      if (tagError) setTagError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateTag()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        closeTagInput()
                      }
                    }}
                    onBlur={() => {
                      if (!newTagName.trim() && !creatingTag) {
                        closeTagInput()
                      }
                    }}
                    placeholder="New tag…"
                    disabled={creatingTag || saving}
                    aria-label="New tag name"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="task-tag-picker__add-btn"
                  onClick={() => setShowTagInput(true)}
                  disabled={creatingTag || saving}
                  aria-label="Add tag"
                  title="Add tag"
                >
                  <NavIcon name="addSquare" />
                </button>
              )}
            </div>
            {tagError && <span className="task-form__hint task-form__hint--error">{tagError}</span>}
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title="Section B — Assignment"
        description={
          values.visibility_type === 'team'
            ? 'Select colleagues from your department.'
            : values.visibility_type === 'department'
              ? 'All active employees in the selected department will see this task.'
              : values.visibility_type === 'location'
                ? 'All employees at the selected location will see this task.'
                : 'This task is visible and assigned only to you.'
        }
      >
        <div className="company-form__grid task-form__grid task-form__grid--2 task-form__assignment-row">
          <FormField label="Assigned By">
            <AssignedByDisplay
              employee={currentEmployee}
              fallbackName={currentUserName}
              avatarUrl={currentUserAvatar}
            />
          </FormField>

          {values.visibility_type === 'self' && (
            <FormField label="Assigned To">
              <SelfAssigneeCard
                employee={currentEmployee}
                fallbackName={currentUserName}
                avatarUrl={currentUserAvatar}
              />
            </FormField>
          )}

          {values.visibility_type === 'department' && (
            <FormField label="Assigned To" required>
              <FilterableSelect
                value={values.department_id}
                onChange={(id) => setField('department_id', id)}
                options={departmentOptions}
                placeholder="Select department"
              />
            </FormField>
          )}

          {values.visibility_type === 'location' && (
            <FormField label="Assigned To" required>
              <FilterableSelect
                value={values.location_id}
                onChange={(id) => setField('location_id', id)}
                options={locationOptions}
                placeholder="Select location"
              />
            </FormField>
          )}
        </div>

        {values.visibility_type === 'team' && (
          <FormField label="Assigned To" fullWidth>
            <TeamMemberPicker
              members={teamMembers}
              selectedIds={values.assignee_employee_ids || []}
              onChange={(ids) => setField('assignee_employee_ids', ids)}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection title="Section C — Schedule & Recurrence" description="When the task starts, when it is due, and recurrence settings.">
        <div className="task-form__schedule">
          <DateTimeRow
            dateLabel="Start Date"
            dateValue={values.start_date}
            onDateChange={(v) => setField('start_date', v)}
            timeLabel="Start Time"
            timeValue={values.start_time}
            onTimeChange={(v) => setField('start_time', v)}
          />
          <DateTimeRow
            dateLabel="Due Date"
            dateValue={values.due_date}
            onDateChange={(v) => setField('due_date', v)}
            timeLabel="Due Time"
            timeValue={values.due_time}
            onTimeChange={(v) => setField('due_time', v)}
          />
        </div>
      </FormSection>

      {values.task_type === 'recurring' && (
        <FormSection title="Recurrence pattern" description="How often this task should repeat.">
          <div className="company-form__grid task-form__grid">
            <FormField label="Frequency">
              <select
                className="company-form__input"
                value={values.recurrence.frequency}
                onChange={(e) => setField('recurrence', { ...values.recurrence, frequency: e.target.value })}
              >
                {RECURRENCE_FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormField>

            {values.recurrence.frequency === 'custom' && (
              <>
                <FormField label="Every">
                  <input
                    type="number"
                    min="1"
                    className="company-form__input"
                    value={values.recurrence.custom_interval}
                    onChange={(e) => setField('recurrence', {
                      ...values.recurrence,
                      custom_interval: e.target.value,
                    })}
                  />
                </FormField>
                <FormField label="Unit">
                  <select
                    className="company-form__input"
                    value={values.recurrence.custom_unit}
                    onChange={(e) => setField('recurrence', {
                      ...values.recurrence,
                      custom_unit: e.target.value,
                    })}
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </FormField>
              </>
            )}

            {values.recurrence.frequency === 'weekly' && (
              <FormField label="Repeat on" fullWidth>
                <div className="task-tag-picker">
                  {WEEKDAY_OPTIONS.map((day) => {
                    const selected = (values.recurrence.weekdays || []).includes(day.value)
                    return (
                      <button
                        key={day.value}
                        type="button"
                        className={`task-tag-picker__chip${selected ? ' task-tag-picker__chip--selected' : ''}`}
                        onClick={() => toggleWeekday(day.value)}
                        aria-pressed={selected}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>
              </FormField>
            )}

            <FormField label="Recurrence start">
              <DateField
                value={values.recurrence.recurrence_start_date}
                onChange={(v) => setField('recurrence', {
                  ...values.recurrence,
                  recurrence_start_date: v,
                })}
              />
            </FormField>

            <FormField label="Recurrence end">
              <DateField
                value={values.recurrence.recurrence_end_date}
                onChange={(v) => setField('recurrence', {
                  ...values.recurrence,
                  recurrence_end_date: v,
                })}
              />
            </FormField>

            <FormField label="Never ends">
              <label className="company-checkbox task-form__checkbox-row">
                <input
                  type="checkbox"
                  checked={values.recurrence.never_ends}
                  onChange={(e) => setField('recurrence', {
                    ...values.recurrence,
                    never_ends: e.target.checked,
                  })}
                />
                <span>Repeat indefinitely</span>
              </label>
            </FormField>
          </div>
        </FormSection>
      )}

      <FormSection title="Reminders" description="Add one or more reminders before the due date.">
        <div className="task-form__reminder-add company-form__grid task-form__grid task-form__grid--3">
          <FormField label="Reminder">
            <select
              className="company-form__input"
              value={reminderType}
              onChange={(e) => setReminderType(e.target.value)}
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FormField>

          {reminderType === 'custom' && (
            <FormField label="Minutes before due">
              <input
                type="number"
                min="0"
                className="company-form__input"
                value={customReminderMinutes}
                onChange={(e) => setCustomReminderMinutes(e.target.value)}
              />
            </FormField>
          )}

          <div className="company-form__field task-form__reminder-btn-wrap">
            <span className="company-form__label">&nbsp;</span>
            <button type="button" className="company-btn company-btn--secondary" onClick={addReminder}>
              Add reminder
            </button>
          </div>
        </div>

        {(values.reminders || []).length > 0 && (
          <div className="task-reminder-list">
            {(values.reminders || []).map((reminder, index) => (
              <span key={`${reminder.reminder_type}-${index}`} className="task-reminder-chip">
                {REMINDER_OPTIONS.find((r) => r.value === reminder.reminder_type)?.label
                  || reminder.reminder_type}
                <button
                  type="button"
                  className="task-reminder-chip__remove"
                  onClick={() => removeReminder(index)}
                  aria-label="Remove reminder"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Section D — Reference Information" description="Link work orders, vendors, or other reference numbers.">
        <FormField label="Vendor / Contractor" fullWidth>
          <FilterableSelect
            value={values.vendor_id}
            onChange={(id) => setField('vendor_id', id)}
            options={vendorOptions}
            placeholder="Select vendor (optional)"
          />
        </FormField>

        <div className="task-form__links">
          {(values.references || []).map((ref, index) => (
            <div key={index} className="task-link-row">
              <FormField label="Reference Type">
                <select
                  className="company-form__input"
                  value={ref.reference_type || 'custom'}
                  onChange={(e) => updateReference(index, 'reference_type', e.target.value)}
                >
                  {REFERENCE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Reference Number">
                <input
                  className="company-form__input"
                  value={ref.reference_number || ''}
                  onChange={(e) => updateReference(index, 'reference_number', e.target.value)}
                  placeholder="Enter reference number"
                />
              </FormField>
              <FormField label="Label">
                <input
                  className="company-form__input"
                  value={ref.reference_label || ''}
                  onChange={(e) => updateReference(index, 'reference_label', e.target.value)}
                  placeholder="Optional label"
                />
              </FormField>
              <div className="task-link-row__action">
                <button type="button" className="company-btn company-btn--secondary company-btn--compact" onClick={addReference}>+</button>
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      {isEdit && (
        <FormSection title="Section E — Task Updates" description="Follow-up notes and completion details.">
          <div className="company-form__grid task-form__grid">
            <FormField label="Follow-up Remarks" fullWidth>
              <textarea
                className="company-form__input company-form__textarea"
                rows={3}
                value={values.follow_up_remarks}
                onChange={(e) => setField('follow_up_remarks', e.target.value)}
              />
            </FormField>
            <FormField label="Next Action" fullWidth>
              <textarea
                className="company-form__input company-form__textarea"
                rows={3}
                value={values.next_action}
                onChange={(e) => setField('next_action', e.target.value)}
              />
            </FormField>
            <FormField label="Completion Remarks" fullWidth>
              <textarea
                className="company-form__input company-form__textarea"
                rows={3}
                value={values.completion_remarks}
                onChange={(e) => setField('completion_remarks', e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>
      )}

      <FormSection title="External links" description="Reference documents, tickets, or related resources.">
        <div className="task-form__links">
          {(values.links || []).map((link, index) => (
            <div key={index} className="task-link-row">
              <FormField label="Title">
                <input
                  className="company-form__input"
                  value={link.title}
                  onChange={(e) => updateLink(index, 'title', e.target.value)}
                  placeholder="Link title"
                />
              </FormField>
              <FormField label="URL">
                <input
                  className="company-form__input"
                  value={link.url}
                  onChange={(e) => updateLink(index, 'url', e.target.value)}
                  placeholder="https://"
                />
              </FormField>
              <div className="task-link-row__action">
                <button
                  type="button"
                  className="company-btn company-btn--secondary company-btn--compact"
                  onClick={addLink}
                  aria-label="Add another link"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection title="Section F — Attachments" description="Upload images, PDFs, documents, or videos related to this task.">
        <TaskAttachmentsSection
          attachments={values.attachments || []}
          removedAttachmentIds={values.removedAttachmentIds || []}
          disabled={saving}
          onChange={({ attachments, removedAttachmentIds }) => {
            onChange({ ...values, attachments, removedAttachmentIds })
          }}
        />
      </FormSection>

      <div className="company-form__actions">
        <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
