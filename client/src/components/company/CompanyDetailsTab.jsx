import { useState, useEffect } from 'react'
import { useCompanyDetails } from '../../hooks/useCompany'
import LogoUpload from './LogoUpload'
import AddressAutocomplete from '../shared/AddressAutocomplete'
import PhoneInput from '../shared/PhoneInput'
import { validatePostalCode, validatePhoneE164 } from '../../lib/validation'
import './CompanyShared.css'

const TEXT_FIELDS = [
  { key: 'name', label: 'Company Name', required: true },
  { key: 'email', label: 'Organization Email', type: 'email' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'tax_id', label: 'Tax ID / GSTIN' },
  { key: 'address_line2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'currency', label: 'Currency' },
]

export default function CompanyDetailsTab({ canManage }) {
  const { company, loading, saving, error, save, reload } = useCompanyDetails()
  const [form, setForm] = useState({})
  const [success, setSuccess] = useState(null)
  const [logoPath, setLogoPath] = useState(null)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (company) {
      const initial = {
        phone: company.phone ?? '',
        address_line1: company.address_line1 ?? '',
      }
      for (const field of TEXT_FIELDS) initial[field.key] = company[field.key] ?? ''
      setForm(initial)
      setLogoPath(company.logo_url || null)
    }
  }, [company])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
    setFormError(null)
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
    setFormError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canManage) return
    setSuccess(null)
    setFormError(null)

    const phoneError = validatePhoneE164(form.phone)
    if (phoneError) {
      setFormError(phoneError)
      return
    }

    const postalError = validatePostalCode(form.postal_code, form.country)
    if (postalError) {
      setFormError(postalError)
      return
    }

    try {
      await save(form)
      setSuccess('Company details saved.')
    } catch {
      // error from hook
    }
  }

  if (loading) return <div className="company-loading">Loading company details...</div>

  return (
    <div className="company-panel">
      {error && <div className="company-alert">{error}</div>}
      {formError && <div className="company-alert">{formError}</div>}
      {success && <div className="company-alert company-alert--success">{success}</div>}

      <form className="company-form" onSubmit={handleSubmit}>
        {company?.id && (
          <LogoUpload
            orgId={company.id}
            logoPath={logoPath}
            canManage={canManage}
            onLogoChange={(path) => {
              setLogoPath(path)
              reload()
            }}
          />
        )}

        <div className="company-form__grid">
          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className="company-form__field">
              <span className="company-form__label">{field.label}</span>
              <input
                type={field.type || 'text'}
                className="company-form__input"
                value={form[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                disabled={!canManage}
                required={field.required && canManage}
                placeholder={field.key === 'postal_code' ? 'Postal / PIN / ZIP code' : undefined}
              />
            </label>
          ))}

          <label className="company-form__field company-form__field--full">
            <span className="company-form__label">Phone</span>
            <PhoneInput
              value={form.phone ?? ''}
              onChange={(phone) => handleChange('phone', phone)}
              disabled={!canManage}
              placeholder="Organization phone"
            />
          </label>

          <label className="company-form__field company-form__field--full">
            <span className="company-form__label">Address Line 1</span>
            <AddressAutocomplete
              value={form.address_line1 ?? ''}
              onChange={(address_line1) => handleChange('address_line1', address_line1)}
              onSelect={handleAddressSelect}
              disabled={!canManage}
              placeholder="Street, area, landmark..."
            />
          </label>
        </div>

        {canManage && (
          <div className="company-form__actions">
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
