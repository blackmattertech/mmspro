import { useState, useEffect } from 'react'
import { generateOrgSlug } from '../../lib/slug'
import { LIMIT_ITEMS, PLAN_DEFAULTS, formatLimitValue } from '../../lib/orgLimits'
import FilterableSelect from '../ui/FilterableSelect'
import '../../components/company/CompanyShared.css'
import './CreateOrgModal.css'

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

export default function CreateOrgModal({ onClose, onSubmit, saving }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [plan, setPlan] = useState('free')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!slugTouched) {
      setSlug(generateOrgSlug(name))
    }
  }, [name, slugTouched])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Organization name is required')
      return
    }

    if (!ownerEmail.trim()) {
      setError('Owner email is required')
      return
    }

    try {
      const result = await onSubmit({
        name: name.trim(),
        slug: slug.trim() || undefined,
        plan,
        ownerEmail: ownerEmail.trim(),
      })
      onClose()
      return result
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h2 className="admin-modal__title">Create Organization</h2>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form className="admin-modal__form" onSubmit={handleSubmit}>
          <label className="admin-modal__field">
            <span className="admin-modal__label">Organization Name</span>
            <input
              type="text"
              className="admin-modal__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BlackMatter Technologies"
              autoFocus
            />
          </label>

          <label className="admin-modal__field">
            <span className="admin-modal__label">URL Slug</span>
            <input
              type="text"
              className="admin-modal__input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }}
              placeholder="blackmatter"
            />
            <span className="admin-modal__hint">mmspro.in/{slug || 'your-org'}/dashboard</span>
          </label>

          <label className="admin-modal__field">
            <span className="admin-modal__label">Plan</span>
            <FilterableSelect
              inputClassName="admin-modal__input"
              value={plan}
              onChange={setPlan}
              options={PLANS}
              getOptionValue={(p) => p.value}
              getOptionLabel={(p) => p.label}
              allowEmpty={false}
            />
            <span className="admin-modal__hint">
              Default limits:{' '}
              {LIMIT_ITEMS.map((item, index) => (
                <span key={item.key}>
                  {index > 0 ? ', ' : ''}
                  {item.label} {formatLimitValue(PLAN_DEFAULTS[plan]?.[item.key])}
                </span>
              ))}
            </span>
          </label>

          <label className="admin-modal__field">
            <span className="admin-modal__label">Owner Email</span>
            <input
              type="email"
              className="admin-modal__input"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@company.com"
            />
            <span className="admin-modal__hint">
              A new account will be created and a password setup email will be sent immediately.
            </span>
          </label>

          {error && <p className="admin-modal__error">{error}</p>}

          <div className="admin-modal__actions">
            <button type="button" className="admin-modal__btn admin-modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-modal__btn admin-modal__btn--primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
