import { useState, useEffect } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
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
}

export default function LocationModal({ location, saving, onClose, onSave, nested = false }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

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
      })
    } else {
      setForm(EMPTY)
    }
  }, [location])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.code.trim()) {
      setError('Name and code are required')
      return
    }
    try {
      await onSave(form)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={`company-modal-overlay ${nested ? 'company-modal-overlay--nested' : ''}`} onMouseDown={handleBackdropClick}>
      <div className="company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="company-modal__header">
          <h2>{location ? 'Edit Location' : 'Add Location'}</h2>
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
            <input className="company-form__input" value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
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
              <input className="company-form__input" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </label>
            <label className="company-form__field">
              <span className="company-form__label">Country</span>
              <input className="company-form__input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </label>
          </div>
          <label className="company-checkbox">
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
            <span>Primary location</span>
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
