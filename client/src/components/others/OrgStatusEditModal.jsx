import { useEffect, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import '../company/CompanyShared.css'

const DEFAULT_FORM = {
  name: '',
  color: '#3B82F6',
  description: '',
  is_active: true,
  is_terminal: false,
}

export default function OrgStatusEditModal({
  item,
  entityLabel,
  saving,
  onClose,
  onSave,
}) {
  const isEdit = Boolean(item?.id)
  const handleBackdropClick = useBackdropClose(onClose)
  const [form, setForm] = useState(() => (item ? { ...DEFAULT_FORM, ...item } : { ...DEFAULT_FORM }))
  const [localError, setLocalError] = useState(null)

  useEffect(() => {
    setForm(item ? { ...DEFAULT_FORM, ...item } : { ...DEFAULT_FORM })
    setLocalError(null)
  }, [item])

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
        description: form.description?.trim() || null,
        is_active: form.is_active !== false,
        is_terminal: Boolean(form.is_terminal),
      })
      onClose()
    } catch (err) {
      setLocalError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick}>
      <div
        className="company-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="org-status-edit-title"
      >
        <div className="company-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label={entityLabel} />
            <h2 id="org-status-edit-title" className="company-modal__title">
              {isEdit ? 'Edit status' : 'Add status'}
            </h2>
          </div>
        </div>

        <form className="company-form" onSubmit={handleSubmit}>
          <div className="company-form__grid">
            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Name *</span>
              <input
                className="company-form__input"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Waiting parts"
                required
                autoFocus
              />
            </label>

            <label className="company-form__field">
              <span className="company-form__label">Color</span>
              <input
                type="color"
                className="company-form__input company-form__input--color"
                value={form.color || '#3B82F6'}
                onChange={(e) => setField('color', e.target.value)}
              />
            </label>

            <label className="company-form__field">
              <span className="company-form__label">Active</span>
              <select
                className="company-form__input"
                value={form.is_active === false ? '0' : '1'}
                onChange={(e) => setField('is_active', e.target.value === '1')}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Description</span>
              <textarea
                className="company-form__input company-form__textarea"
                rows={2}
                value={form.description || ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Optional note for admins"
              />
            </label>

            <label className="company-form__field company-form__field--full company-form__check">
              <input
                type="checkbox"
                checked={Boolean(form.is_terminal)}
                onChange={(e) => setField('is_terminal', e.target.checked)}
              />
              <span>Terminal status (completed / closed style)</span>
            </label>
          </div>

          {localError && <p className="company-alert">{localError}</p>}

          <div className="company-form__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
