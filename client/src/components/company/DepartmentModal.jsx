import { useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import PageBack from '../shared/PageBack'
import {
  LOCATION_ALL,
  LOCATION_NONE,
} from '../../lib/departmentLocation'
import LocationModal from './LocationModal'
import FilterableSelect from '../ui/FilterableSelect'
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

  const locationScopeOptions = [
    ...(!lockLocation
      ? [
          { value: LOCATION_ALL, label: 'All locations' },
          { value: LOCATION_NONE, label: 'No location' },
        ]
      : []),
    ...locations.map((loc) => ({ value: loc.id, label: loc.name })),
  ]

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
      <div
        className={`company-modal-overlay company-modal-overlay--popup ${nested ? 'company-modal-overlay--nested' : ''}`}
        onMouseDown={handleBackdropClick}
        role="presentation"
      >
        <div
          className="company-modal company-modal--popup"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="department-modal-title"
        >
          <div className="company-modal__header">
            <div className="modal__header-main">
              <PageBack onClick={onClose} className="page-back--header" label="Departments" />
              <h2 id="department-modal-title">{department ? 'Edit Department' : 'Add Department'}</h2>
            </div>
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
                <FilterableSelect
                  className="company-form__input--select"
                  value={form.locationScope}
                  onChange={(next) => setForm({ ...form, locationScope: next })}
                  options={locationScopeOptions}
                  getOptionValue={(opt) => opt.value}
                  getOptionLabel={(opt) => opt.label}
                  disabled={lockLocation}
                  allowEmpty={false}
                />
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
              <FilterableSelect
                className="company-form__input--select"
                value={form.parent_id}
                onChange={(next) => setForm({ ...form, parent_id: next })}
                options={parentOptions}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => `${d.code ? `${d.code} — ` : ''}${d.name}`}
                emptyLabel="None"
                placeholder="None"
              />
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
