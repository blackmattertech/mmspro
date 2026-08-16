import { useState, useEffect, useMemo } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import AddressAutocomplete from '../shared/AddressAutocomplete'
import { validatePostalCode } from '../../lib/validation'
import { employeesForLocationHead } from '../../lib/departmentLocation'
import EmployeeSelect from './EmployeeSelect'
import GooToggle from '../ui/GooToggle'
import './CompanyShared.css'

const EMPTY = {
  name: '',
  code: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  is_primary: false,
  head_employee_id: '',
}

export default function LocationModal({
  location,
  employees = [],
  saving,
  onClose,
  onSave,
  nested = false,
}) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const headOptions = useMemo(
    () => employeesForLocationHead(employees, location?.id, form.head_employee_id),
    [employees, location?.id, form.head_employee_id],
  )

  useEffect(() => {
    if (location) {
      setForm({
        name: location.name || '',
        code: location.code || '',
        address_line1: location.address_line1 || '',
        address_line2: location.address_line2 || '',
        city: location.city || '',
        state: location.state || '',
        postal_code: location.postal_code || '',
        country: location.country || '',
        is_primary: Boolean(location.is_primary),
        head_employee_id: location.head_employee_id || '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [location])

  useEffect(() => {
    if (!location?.id || !form.head_employee_id) return
    const stillValid = headOptions.some((emp) => emp.id === form.head_employee_id)
    if (!stillValid) {
      setForm((prev) => ({ ...prev, head_employee_id: '' }))
    }
  }, [headOptions, form.head_employee_id, location?.id])

  const handleAddressSelect = (address) => {
    setForm((prev) => ({
      ...prev,
      address_line1: address.address_line1 || prev.address_line1,
      address_line2: address.address_line2 || prev.address_line2,
      city: address.city || prev.city,
      state: address.state || prev.state,
      postal_code: address.postal_code || prev.postal_code,
      country: address.country || prev.country,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.code.trim()) {
      setError('Name and code are required')
      return
    }

    const postalError = validatePostalCode(form.postal_code, form.country)
    if (postalError) {
      setError(postalError)
      return
    }

    try {
      const payload = { ...form }
      if (!location) {
        delete payload.head_employee_id
      } else {
        payload.head_employee_id = form.head_employee_id || null
      }
      await onSave(payload)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
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
        aria-labelledby="location-modal-title"
      >
        <div className="company-modal__header">
          <h2 id="location-modal-title">{location ? 'Edit Location' : 'Add Location'}</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="company-modal__form" onSubmit={handleSubmit}>
          <label className="company-form__field">
            <span className="company-form__label">Name *</span>
            <input className="company-form__input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Code *</span>
            <input className="company-form__input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="e.g. HQ" />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Address Line 1</span>
            <AddressAutocomplete
              value={form.address_line1}
              onChange={(address_line1) => setForm((prev) => ({ ...prev, address_line1 }))}
              onSelect={handleAddressSelect}
              placeholder="Street, area, landmark..."
            />
          </label>
          <label className="company-form__field">
            <span className="company-form__label">Address Line 2</span>
            <input className="company-form__input" value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
          </label>
          <div className="company-form__grid company-form__grid--2">
            <label className="company-form__field">
              <span className="company-form__label">City</span>
              <input className="company-form__input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">State</span>
              <input className="company-form__input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </label>
          </div>
          <div className="company-form__grid company-form__grid--2">
            <label className="company-form__field">
              <span className="company-form__label">Postal Code</span>
              <input
                className="company-form__input"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                placeholder={form.country?.toLowerCase().includes('india') ? '6-digit PIN' : 'Postal / ZIP code'}
              />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Country</span>
              <input className="company-form__input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </label>
          </div>
          <div className="company-employee-photo__login">
            <span className="company-employee-photo__login-label">Primary location</span>
            <GooToggle
              checked={form.is_primary}
              onChange={(checked) => setForm({ ...form, is_primary: checked })}
              ariaLabel="Primary location"
            />
          </div>
          {location ? (
            <EmployeeSelect
              label="Location head"
              value={form.head_employee_id}
              onChange={(head_employee_id) => setForm({ ...form, head_employee_id })}
              options={headOptions}
              placeholder="None"
              disabled={!headOptions.length}
            />
          ) : (
            <p className="company-modal__hint">
              Save the location first, assign employees to it, then set a location head when editing.
            </p>
          )}
          {location && !headOptions.length && (
            <p className="company-modal__hint">
              No employees at this location yet. Assign employees first, then choose a location head.
            </p>
          )}
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
