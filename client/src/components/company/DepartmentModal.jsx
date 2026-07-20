import { useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import {
  LOCATION_ALL,
  LOCATION_NONE,
} from '../../lib/departmentLocation'
import LocationModal from './LocationModal'
import './CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
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

function emptyForm(defaultLocationId = '') {
  return {
    ...EMPTY,
    locationScope: defaultLocationId || LOCATION_NONE,
  }
}

export default function DepartmentModal({
  department,
  locations,
  departments,
  saving,
  nestedSaving = false,
  defaultLocationId = '',
  lockLocation = false,
  onClose,
  onSave,
  onCreateLocation,
  onLimitExceeded,
  nested = false,
}) {
  const [form, setForm] = useState(() => emptyForm(defaultLocationId))
  const [error, setError] = useState(null)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  useEffect(() => {
    if (department) {
      setForm({
        name: department.name || '',
        code: department.code || '',
        description: department.description || '',
        locationScope: toLocationScope(department),
        parent_id: department.parent_id || '',
      })
    } else {
      setForm(emptyForm(defaultLocationId))
    }
  }, [department, defaultLocationId])

  useEffect(() => {
    if (department || !defaultLocationId) return
    setForm((prev) => (
      prev.locationScope && prev.locationScope !== LOCATION_NONE
        ? prev
        : { ...prev, locationScope: defaultLocationId }
    ))
  }, [department, defaultLocationId])

  useEffect(() => {
    if (!lockLocation || !defaultLocationId || department) return
    if (form.locationScope === defaultLocationId) return
    setForm((prev) => ({ ...prev, locationScope: defaultLocationId }))
  }, [lockLocation, defaultLocationId, department, form.locationScope])

  const parentOptions = departments.filter((d) => d.id !== department?.id)
  const canCreateLocation = Boolean(onCreateLocation) && !lockLocation

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required')
      return
    }
    if (!form.code.trim()) {
      setError('Code is required')
      return
    }
    try {
      const locationScope = lockLocation && defaultLocationId
        ? defaultLocationId
        : form.locationScope
      await onSave({
        name: form.name,
        code: form.code,
        description: form.description,
        parent_id: form.parent_id || null,
        ...scopeToPayload(locationScope),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleNestedLocationSave = async (payload) => {
    try {
      const created = await onCreateLocation(payload)
      setForm((prev) => ({
        ...prev,
        locationScope: created.id,
      }))
      setShowLocationModal(false)
    } catch (err) {
      if (onLimitExceeded?.(err, 'Location')) {
        setShowLocationModal(false)
        return
      }
      throw err
    }
  }

  return (
    <>
      <div className={`company-modal-overlay ${nested ? 'company-modal-overlay--nested' : ''}`} onMouseDown={handleBackdropClick}>
        <div className="company-modal" onClick={(e) => e.stopPropagation()}>
          <div className="company-modal__header">
            <h2>{department ? 'Edit Department' : 'Add Department'}</h2>
            <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <form className="company-modal__form" onSubmit={handleSubmit}>
            <div className="company-form__grid company-form__grid--2">
              <label className="company-form__field">
                <span className="company-form__label">Name *</span>
                <input className="company-form__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="company-form__field">
                <span className="company-form__label">Code *</span>
                <input
                  className="company-form__input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g. MNT"
                />
              </label>
            </div>
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
              <div className="company-creatable-select">
                <select
                  className="company-form__input company-form__input--select"
                  value={form.locationScope}
                  onChange={(e) => setForm({ ...form, locationScope: e.target.value })}
                  disabled={lockLocation}
                >
                  {!lockLocation && (
                    <>
                      <option value={LOCATION_ALL}>All locations</option>
                      <option value={LOCATION_NONE}>No location</option>
                    </>
                  )}
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                {canCreateLocation && (
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    onClick={() => setShowLocationModal(true)}
                  >
                    + Create
                  </button>
                )}
              </div>
              {lockLocation && (
                <span className="company-modal__hint">
                  Location is limited to your assigned location.
                </span>
              )}
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
                  <option key={d.id} value={d.id}>{d.code ? `${d.code} — ` : ''}{d.name}</option>
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

      {showLocationModal && canCreateLocation && (
        <LocationModal
          nested
          location={null}
          saving={nestedSaving}
          onClose={() => setShowLocationModal(false)}
          onSave={handleNestedLocationSave}
        />
      )}
    </>
  )
}

export function formatDepartmentLocation(dept) {
  if (dept.all_locations) return 'All locations'
  if (dept.org_locations?.name) return dept.org_locations.name
  return '—'
}
