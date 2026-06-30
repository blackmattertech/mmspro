import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { onboardOrg } from '../../lib/api'
import { generateOrgSlug } from '../../lib/slug'
import { useOrg } from '../../hooks/useOrg'
import './Login.css'

export default function Onboard() {
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { org, loading: orgLoading } = useOrg()

  useEffect(() => {
    if (!orgLoading && org?.slug) {
      navigate(`/${org.slug}/dashboard`, { replace: true })
    }
  }, [org, orgLoading, navigate])

  const previewSlug = companyName.trim() ? generateOrgSlug(companyName) : ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { slug } = await onboardOrg(companyName.trim())
      navigate(`/${slug}/dashboard`, { replace: true })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (orgLoading || org?.slug) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="login-page">
      <section className="login-panel" style={{ width: '100%' }}>
        <div className="login-card">
          <img
            src="/Assets/images/logo.svg"
            alt="MMS PRO"
            className="login-card__logo"
          />

          <div className="login-card__header">
            <h2 className="login-card__title">Set Up Your Company</h2>
            <p className="login-card__subtitle">
              Enter your company name to get started with <span className="text-primary">MMS PRO</span>
            </p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <p className="login-form__error" role="alert">{error}</p>}

            <div className="form-field">
              <label htmlFor="companyName" className="form-field__label">Company Name</label>
              <div className="form-field__input-wrap">
                <input
                  id="companyName"
                  type="text"
                  className="form-field__input"
                  placeholder="e.g. BlackMatter Technologies"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {previewSlug && (
                <p className="login-card__subtitle" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  Your workspace URL: <span className="text-primary">mmspro.in/{previewSlug}</span>
                </p>
              )}
            </div>

            <button type="submit" className="login-form__submit" disabled={loading || !companyName.trim()}>
              {loading ? 'Creating workspace...' : 'Continue'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
