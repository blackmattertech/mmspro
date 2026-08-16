import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import TaskPriorityIcon, { PRIORITY_ICON_OPTIONS } from './TaskPriorityIcon'
import '../company/CompanyShared.css'
import './TaskMetaSettings.css'

function trimOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

const DEFAULT_STATUS = {
  name: '',
  color: '#3B82F6',
  description: '',
  is_active: true,
  is_terminal: false,
}

const DEFAULT_PRIORITY = {
  name: '',
  color: '#6B7280',
  icon: 'minus',
  description: '',
  is_active: true,
}

const DEFAULT_SIMPLE = {
  name: '',
  is_active: true,
}

export default function TaskMetaEditModal({
  kind,
  item,
  saving,
  onClose,
  onSave,
}) {
  const isStatus = kind === 'status'
  const isPriority = kind === 'priority'
  const isSimple = kind === 'category' || kind === 'tag'
  const isEdit = Boolean(item?.id)
  const handleBackdropClick = useBackdropClose(onClose)
  const [form, setForm] = useState(() => {
    if (item) return { ...item }
    if (isStatus) return { ...DEFAULT_STATUS }
    if (isPriority) return { ...DEFAULT_PRIORITY }
    return { ...DEFAULT_SIMPLE }
  })
  const [localError, setLocalError] = useState(null)

  useEffect(() => {
    if (item) setForm({ ...item })
    else if (isStatus) setForm({ ...DEFAULT_STATUS })
    else if (isPriority) setForm({ ...DEFAULT_PRIORITY })
    else setForm({ ...DEFAULT_SIMPLE })
    setLocalError(null)
  }, [item, isStatus, isPriority])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const name = form.name?.trim()
    if (!name) {
      setLocalError('Name is required')
      return
    }

    setLocalError(null)
    try {
      await onSave({
        name,
        color: form.color || null,
        description: trimOrNull(form.description),
        is_active: form.is_active !== false,
        ...(isStatus ? { is_terminal: Boolean(form.is_terminal) } : {}),
        ...(isPriority ? { icon: form.icon || 'minus' } : {}),
      })
      onClose()
    } catch (err) {
      setLocalError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay task-meta-edit-overlay company-modal-overlay--nested" onMouseDown={handleBackdropClick}>
      <div
        className="company-modal task-meta-edit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="task-meta-edit-title"
      >
        <div className="company-modal__header">
          <h2 id="task-meta-edit-title">
            {isEdit ? 'Edit' : 'New'}
            {' '}
            {isStatus ? 'Status' : isPriority ? 'Priority' : kind === 'category' ? 'Category' : 'Tag'}
          </h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="company-modal__form task-meta-edit-modal__form" onSubmit={handleSubmit}>
          {localError && <div className="company-alert" role="alert">{localError}</div>}

          <label className="company-form__field">
            <span className="company-form__label">Name</span>
            <input
              className="company-form__input"
              value={form.name || ''}
              onChange={(e) => setField('name', e.target.value)}
              placeholder={isStatus ? 'e.g. In Progress' : 'e.g. High'}
              autoFocus
              required
            />
          </label>

          {!isSimple && (
            <label className="company-form__field">
              <span className="company-form__label">Color</span>
              <div className="task-meta-edit-modal__color-row">
                <input
                  type="color"
                  className="task-meta-edit-modal__color-input"
                  value={form.color || '#6B7280'}
                  onChange={(e) => setField('color', e.target.value)}
                  aria-label="Pick color"
                />
                <input
                  className="company-form__input"
                  value={form.color || ''}
                  onChange={(e) => setField('color', e.target.value)}
                  placeholder="#3B82F6"
                />
              </div>
            </label>
          )}

          {(isStatus || isPriority) && (
            <label className="company-form__field">
              <span className="company-form__label">Description</span>
              <textarea
                className="company-form__input company-form__textarea"
                rows={3}
                value={form.description || ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Optional description for admins"
              />
            </label>
          )}

          {!isStatus && !isSimple && (
            <label className="company-form__field">
              <span className="company-form__label">Icon</span>
              <div className="task-meta-edit-modal__icon-row">
                <select
                  className="company-form__input"
                  value={form.icon || 'minus'}
                  onChange={(e) => setField('icon', e.target.value)}
                >
                  {PRIORITY_ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="task-meta-edit-modal__icon-preview" style={{ color: form.color || '#6B7280' }}>
                  <TaskPriorityIcon icon={form.icon} size={22} color={form.color || '#6B7280'} />
                </span>
              </div>
            </label>
          )}

          <label className="company-form__checkbox">
            <input
              type="checkbox"
              checked={form.is_active !== false}
              onChange={(e) => setField('is_active', e.target.checked)}
            />
            <span>Active</span>
          </label>

          {isStatus && (
            <label className="company-form__checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.is_terminal)}
                onChange={(e) => setField('is_terminal', e.target.checked)}
              />
              <span>Terminal status (completed / cancelled)</span>
            </label>
          )}

          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
