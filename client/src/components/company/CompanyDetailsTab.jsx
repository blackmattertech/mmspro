import { useState, useEffect } from 'react'
import { useCompanyDetails } from '../../hooks/useCompany'
import LogoUpload from './LogoUpload'
import './CompanyShared.css'

const FIELDS = [
  { key: 'name', label: 'Company Name', required: true },
  { key: 'email', label: 'Organization Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'tax_id', label: 'Tax ID / GSTIN' },
  { key: 'address_line1', label: 'Address Line 1' },
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

  useEffect(() => {
    if (company) {
      const initial = {}
      for (const f of FIELDS) initial[f.key] = company[f.key] ?? ''
      setForm(initial)
      setLogoPath(company.logo_url || null)
    }
  }, [company])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canManage) return
    setSuccess(null)
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
          {FIELDS.map((field) => (
            <label key={field.key} className="company-form__field">
              <span className="company-form__label">{field.label}</span>
              <input
                type={field.type || 'text'}
                className="company-form__input"
                value={form[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                disabled={!canManage}
                required={field.required && canManage}
              />
            </label>
          ))}
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
