import { useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import './CompanyShared.css'

const LOCATION_ALL = '__all__'
const LOCATION_NONE = '__none__'

const EMPTY = {
  name: '',
  description: '',
  locationScope: LOCATION_NONE,
  parent_id: '',
}

function toLocationScope(department) {
  if (!department) return LOCATION_NONE
  if (department.all_locations) return LOCATION_ALL
  if (department.location_id) return department.location_id
  return LOCATION_NONE
}

function scopeToPayload(locationScope) {
  if (locationScope === LOCATION_ALL) {
    return { all_locations: true, location_id: null }
  }
  if (locationScope === LOCATION_NONE) {
    return { all_locations: false, location_id: null }
  }
  return { all_locations: false, location_id: locationScope }
}

export default function DepartmentModal({ department, locations, departments, saving, onClose, onSave, nested = false }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    if (department) {
      setForm({
        name: department.name || '',
        description: department.description || '',
        locationScope: toLocationScope(department),
        parent_id: department.parent_id || '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [department])

  const parentOptions = departments.filter((d) => d.id !== department?.id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    try {
      await onSave({
        name: form.name,
        description: form.description,
        parent_id: form.parent_id || null,
        ...scopeToPayload(form.locationScope),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={`company-modal-overlay ${nested ? 'company-modal-overlay--nested' : ''}`} onMouseDown={handleBackdropClick}>
      <div className="company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>{department ? 'Edit Department' : 'Add Department'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input className="company-form__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Description</span>
            <textarea
              className="company-form__input company-form__textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Location</span>
            <select
              className="company-form__input company-form__input--select"
              value={form.locationScope}
              onChange={(e) => setForm({ ...form, locationScope: e.target.value })}
            >
              <option value={LOCATION_ALL}>All locations</option>
              <option value={LOCATION_NONE}>No location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Parent Department</span>
            <select
              className="company-form__input company-form__input--select"
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">None</option>
              {parentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          {error && <p className="company-alert">{error}</p>}
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function formatDepartmentLocation(dept) {
  if (dept.all_locations) return 'All locations'
  if (dept.org_locations?.name) return dept.org_locations.name
  return '—'
}
