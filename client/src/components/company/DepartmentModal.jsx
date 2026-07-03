import { useMemo, useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import {
  LOCATION_ALL,
  LOCATION_NONE,
  HEAD_MODE_SINGLE,
  HEAD_MODE_PER_LOCATION,
  employeesForDepartmentHead,
  buildLocationHeadsPayload,
  locationHeadsMapFromDepartment,
} from '../../lib/departmentLocation'
import LocationModal from './LocationModal'
import EmployeeSelect from './EmployeeSelect'
import './CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
  description: '',
  locationScope: LOCATION_NONE,
  parent_id: '',
  head_mode: HEAD_MODE_SINGLE,
  head_employee_id: '',
  location_heads: {},
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

function headPickerHint(locationScope, headMode) {
  if (locationScope === LOCATION_ALL) {
    if (headMode === HEAD_MODE_PER_LOCATION) {
      return 'Assign a head for each location. Leave blank if not needed yet.'
    }
    return 'This person will be the head at every location.'
  }
  if (locationScope === LOCATION_NONE) {
    return 'Any active employee can be selected.'
  }
  return 'Only employees at this location are shown.'
}

function resetHeadFields() {
  return {
    head_mode: HEAD_MODE_SINGLE,
    head_employee_id: '',
    location_heads: {},
  }
}

export default function DepartmentModal({
  department,
  locations,
  departments,
  employees = [],
  saving,
  nestedSaving = false,
  onClose,
  onSave,
  onCreateLocation,
  nested = false,
}) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const handleBackdropClick = useBackdropClose(onClose)

  const isAllLocations = form.locationScope === LOCATION_ALL
  const usePerLocationHeads = isAllLocations && form.head_mode === HEAD_MODE_PER_LOCATION

  const headOptions = useMemo(
    () => employeesForDepartmentHead(employees, form.locationScope, form.head_employee_id),
    [employees, form.locationScope, form.head_employee_id],
  )

  useEffect(() => {
    if (department) {
      setForm({
        name: department.name || '',
        code: department.code || '',
        description: department.description || '',
        locationScope: toLocationScope(department),
        parent_id: department.parent_id || '',
        head_mode: department.per_location_heads ? HEAD_MODE_PER_LOCATION : HEAD_MODE_SINGLE,
        head_employee_id: department.head_employee_id || '',
        location_heads: locationHeadsMapFromDepartment(department),
      })
    } else {
      setForm(EMPTY)
    }
  }, [department])

  useEffect(() => {
    if (!form.head_employee_id || usePerLocationHeads) return
    const stillValid = headOptions.some((emp) => emp.id === form.head_employee_id)
    if (!stillValid) {
      setForm((prev) => ({ ...prev, head_employee_id: '' }))
    }
  }, [headOptions, form.head_employee_id, usePerLocationHeads])

  const parentOptions = departments.filter((d) => d.id !== department?.id)

  const handleLocationScopeChange = (locationScope) => {
    setForm((prev) => ({
      ...prev,
      locationScope,
      ...resetHeadFields(),
    }))
  }

  const handleHeadModeChange = (head_mode) => {
    setForm((prev) => ({
      ...prev,
      head_mode,
      head_employee_id: '',
      location_heads: {},
    }))
  }

  const setLocationHead = (locationId, headEmployeeId) => {
    setForm((prev) => ({
      ...prev,
      location_heads: {
        ...prev.location_heads,
        [locationId]: headEmployeeId,
      },
    }))
  }

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
      await onSave({
        name: form.name,
        code: form.code,
        description: form.description,
        parent_id: form.parent_id || null,
        per_location_heads: usePerLocationHeads,
        head_employee_id: usePerLocationHeads ? null : (form.head_employee_id || null),
        location_heads: usePerLocationHeads
          ? buildLocationHeadsPayload(form.location_heads, locations)
          : [],
        ...scopeToPayload(form.locationScope),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleNestedLocationSave = async (payload) => {
    const created = await onCreateLocation(payload)
    setForm((prev) => ({
      ...prev,
      locationScope: created.id,
      ...resetHeadFields(),
    }))
    setShowLocationModal(false)
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
                  onChange={(e) => handleLocationScopeChange(e.target.value)}
                >
                  <option value={LOCATION_ALL}>All locations</option>
                  <option value={LOCATION_NONE}>No location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                {onCreateLocation && (
                  <button
                    type="button"
                    className="company-btn company-btn--secondary company-btn--compact"
                    onClick={() => setShowLocationModal(true)}
                  >
                    + Create
                  </button>
                )}
              </div>
            </label>

            {isAllLocations && (
              <fieldset className="company-head-mode">
                <legend className="company-form__label">Department Head</legend>
                <label className="company-head-mode__option">
                  <input
                    type="radio"
                    name="head_mode"
                    checked={form.head_mode === HEAD_MODE_SINGLE}
                    onChange={() => handleHeadModeChange(HEAD_MODE_SINGLE)}
                  />
                  <span>One head for all locations</span>
                </label>
                <label className="company-head-mode__option">
                  <input
                    type="radio"
                    name="head_mode"
                    checked={form.head_mode === HEAD_MODE_PER_LOCATION}
                    onChange={() => handleHeadModeChange(HEAD_MODE_PER_LOCATION)}
                  />
                  <span>Separate head per location</span>
                </label>
              </fieldset>
            )}

            {usePerLocationHeads ? (
              <div className="company-location-heads">
                {locations.map((loc) => (
                  <EmployeeSelect
                    key={loc.id}
                    label={loc.name}
                    value={form.location_heads[loc.id] || ''}
                    onChange={(headEmployeeId) => setLocationHead(loc.id, headEmployeeId)}
                    options={employeesForDepartmentHead(
                      employees,
                      loc.id,
                      form.location_heads[loc.id],
                    )}
                    placeholder="None"
                  />
                ))}
                <p className="company-modal__hint">{headPickerHint(form.locationScope, form.head_mode)}</p>
              </div>
            ) : (
              <EmployeeSelect
                label={isAllLocations ? 'Department Head' : 'Department Head'}
                value={form.head_employee_id}
                onChange={(head_employee_id) => setForm({ ...form, head_employee_id })}
                options={headOptions}
                placeholder="None"
              />
            )}

            {!usePerLocationHeads && (
              <p className="company-modal__hint">{headPickerHint(form.locationScope, form.head_mode)}</p>
            )}

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

      {showLocationModal && onCreateLocation && (
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
