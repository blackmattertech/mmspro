import { useEffect, useState } from 'react'
import AddressAutocomplete from '../shared/AddressAutocomplete'
import PhoneInput from '../shared/PhoneInput'
import SpellcheckInput from '../shared/SpellcheckInput'
import PageBack from '../shared/PageBack'
import { validatePostalCode, validatePhoneE164, validateWebsite, normalizeWebsite } from '../../lib/validation'
import '../company/CompanyShared.css'
import './CreateOrgModal.css'
import './EditOrgDetailsModal.css'

function CopyIdButton({ value }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className="edit-org-modal__copy-btn"
      onClick={handleCopy}
      disabled={!value}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const TEXT_FIELDS_TOP = [
  { key: 'name', label: 'Company Name', required: true },
  {
    key: 'email',
    label: 'Owner / Login Email',
    type: 'email',
    required: true,
    hint: 'Used for sign-in and forgot password. Changing it updates the owner account and sends a password setup email.',
  },
  { key: 'website', label: 'Website', type: 'text', inputMode: 'url', autoComplete: 'url', placeholder: 'www.example.com' },
  { key: 'tax_id', label: 'Tax ID / GSTIN' },
]

const TEXT_FIELDS_BOTTOM = [
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
]

function buildForm(org) {
  return {
    name: org?.name ?? '',
    slug: org?.slug ?? '',
    email: org?.email ?? '',
    phone: org?.phone ?? '',
    website: org?.website ?? '',
    tax_id: org?.tax_id ?? '',
    currency: org?.currency ?? '',
    address_line1: org?.address_line1 ?? '',
    address_line2: org?.address_line2 ?? '',
    city: org?.city ?? '',
    state: org?.state ?? '',
    postal_code: org?.postal_code ?? '',
    country: org?.country ?? '',
  }
}

export default function EditOrgDetailsModal({ org, onClose, onSubmit, saving }) {
  const [form, setForm] = useState(() => buildForm(org))
  const [error, setError] = useState(null)

  useEffect(() => {
    setForm(buildForm(org))
    setError(null)
  }, [org])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

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
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Organization name is required')
      return
    }

    if (!form.email.trim()) {
      setError('Owner / login email is required')
      return
    }

    if (!form.slug.trim()) {
      setError('URL slug is required')
      return
    }

    const websiteError = validateWebsite(form.website)
    if (websiteError) {
      setError(websiteError)
      return
    }

    const phoneError = validatePhoneE164(form.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const postalError = validatePostalCode(form.postal_code, form.country)
    if (postalError) {
      setError(postalError)
      return
    }

    try {
      await onSubmit(org.id, {
        name: form.name.trim(),
        slug: form.slug.trim(),
        email: form.email.trim(),
        phone: form.phone,
        website: normalizeWebsite(form.website),
        tax_id: form.tax_id.trim(),
        currency: form.currency.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim(),
        country: form.country.trim(),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save organization details')
    }
  }

  return (
    <div className="admin-modal-overlay admin-modal-overlay--popup" onClick={onClose}>
      <div
        className="admin-modal admin-modal--popup edit-org-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-org-title"
      >
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Organizations" />
            <h2 id="edit-org-title" className="admin-modal__title">Edit Company Details</h2>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="admin-modal__form edit-org-modal__form" onSubmit={handleSubmit}>
          <div className="company-form__grid">
            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Organization ID</span>
              <div className="edit-org-modal__id-row">
                <input
                  type="text"
                  className="company-form__input edit-org-modal__id-input"
                  value={org?.id || ''}
                  readOnly
                />
                <CopyIdButton value={org?.id || ''} />
              </div>
              <span className="admin-modal__hint">
                Use this UUID with <code>npm run delete:org --prefix server</code> to wipe this company.
              </span>
            </label>

            {TEXT_FIELDS_TOP.map((field) => (
              <label key={field.key} className="company-form__field">
                <span className="company-form__label">{field.label}</span>
                {field.type || field.key === 'tax_id' ? (
                  <input
                    type={field.type || 'text'}
                    className="company-form__input"
                    value={form[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                    inputMode={field.inputMode}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    autoFocus={field.key === 'name'}
                  />
                ) : (
                  <SpellcheckInput
                    className="company-form__input"
                    value={form[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                  />
                )}
                {field.hint && <span className="admin-modal__hint">{field.hint}</span>}
              </label>
            ))}

            <label className="company-form__field">
              <span className="company-form__label">URL Slug</span>
              <input
                type="text"
                className="company-form__input"
                value={form.slug}
                onChange={(e) => handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
              />
              <span className="admin-modal__hint">mmspro.in/{form.slug || 'your-org'}/dashboard</span>
            </label>

            <label className="company-form__field">
              <span className="company-form__label">Phone</span>
              <PhoneInput
                value={form.phone ?? ''}
                onChange={(phone) => handleChange('phone', phone)}
                placeholder="Organization phone"
              />
            </label>

            <label className="company-form__field">
              <span className="company-form__label">Currency</span>
              <input
                type="text"
                className="company-form__input"
                value={form.currency ?? ''}
                onChange={(e) => handleChange('currency', e.target.value)}
                placeholder="e.g. INR"
              />
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Address Line 1</span>
              <AddressAutocomplete
                value={form.address_line1 ?? ''}
                onChange={(address_line1) => handleChange('address_line1', address_line1)}
                onSelect={handleAddressSelect}
                placeholder="Street, area, landmark..."
              />
            </label>

            <label className="company-form__field company-form__field--full">
              <span className="company-form__label">Address Line 2</span>
              <SpellcheckInput
                className="company-form__input"
                value={form.address_line2 ?? ''}
                onChange={(e) => handleChange('address_line2', e.target.value)}
              />
            </label>

            {TEXT_FIELDS_BOTTOM.map((field) => (
              <label key={field.key} className="company-form__field">
                <span className="company-form__label">{field.label}</span>
                {field.key === 'postal_code' ? (
                  <input
                    type="text"
                    className="company-form__input"
                    value={form[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder="Postal / PIN / ZIP code"
                  />
                ) : (
                  <SpellcheckInput
                    className="company-form__input"
                    value={form[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>

          {error && <p className="admin-modal__error">{error}</p>}

          <div className="admin-modal__actions">
            <button type="button" className="admin-modal__btn admin-modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-modal__btn admin-modal__btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
