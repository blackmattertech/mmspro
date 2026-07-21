import { useEffect, useMemo, useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import { useLocations } from '../../hooks/useLocations'
import { useDepartments } from '../../hooks/useDepartments'
import FilterableSelect from '../ui/FilterableSelect'
import '../company/CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
  location_id: '',
  department_id: '',
}

export default function AreaModal({ area, saving, onClose, onSave }) {
  const isEdit = Boolean(area?.id)
  const { locations } = useLocations()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const { departments } = useDepartments(form.location_id || undefined)

  useEffect(() => {
    if (area) {
      setForm({
        name: area.name || '',
        code: area.code || '',
        location_id: area.location_id || '',
        department_id: area.department_id || '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [area])

  const activeLocations = useMemo(
    () => (locations || []).filter((l) => l.is_active !== false),
    [locations],
  )
  const activeDepartments = useMemo(
    () => (departments || []).filter((d) => d.is_active !== false),
    [departments],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (!form.location_id) {
      setError('Location is required')
      return
    }
    if (!form.department_id) {
      setError('Department is required')
      return
    }
    try {
      await onSave({
        name: form.name.trim(),
        code: form.code.trim() || null,
        location_id: form.location_id,
        department_id: form.department_id,
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay" onMouseDown={handleBackdropClick} role="presentation">
      <div className="company-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="area-modal-title">
        <div className="company-modal__header">
          <h2 id="area-modal-title">{isEdit ? 'Edit Area' : 'Add Area'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input
              className="company-form__input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Code</span>
            <input
              className="company-form__input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Location *</span>
            <FilterableSelect
              className="company-form__input--select"
              value={form.location_id}
              onChange={(next) => setForm((f) => ({
                ...f,
                location_id: next,
                department_id: '',
              }))}
              options={activeLocations}
              getOptionValue={(loc) => loc.id}
              getOptionLabel={(loc) => loc.name}
              placeholder="Select location…"
              required
              allowEmpty={false}
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Department *</span>
            <FilterableSelect
              className="company-form__input--select"
              value={form.department_id}
              onChange={(next) => setForm((f) => ({ ...f, department_id: next }))}
              options={activeDepartments}
              getOptionValue={(dept) => dept.id}
              getOptionLabel={(dept) => dept.name}
              placeholder="Select department…"
              required
              disabled={!form.location_id}
              allowEmpty={false}
            />
          </label>
          {error && <div className="company-alert">{error}</div>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create area'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
