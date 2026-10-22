import { useState, useEffect } from 'react'
import { generateOrgSlug } from '../../lib/slug'
import { getAdminPlans } from '../../lib/api'
import FilterableSelect from '../ui/FilterableSelect'
import PageBack from '../shared/PageBack'
import SpellcheckInput from '../shared/SpellcheckInput'
import '../../components/company/CompanyShared.css'
import './CreateOrgModal.css'

const INTERVAL_LABELS = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half yearly',
  yearly: 'Yearly',
  trial: 'Trial',
  custom: 'Custom',
}

function planLabel(plan) {
  if (plan.price == null || plan.price === '') return plan.name
  const amount = Number(plan.price)
  if (!Number.isFinite(amount)) return plan.name
  const price = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency || 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
  return `${plan.name} · ${price}`
}

function planHint(plan) {
  if (!plan) return 'Choose a plan from the Plans page.'
  const interval = INTERVAL_LABELS[plan.interval_type] || plan.interval_type
  const days = plan.duration_days ? `${plan.duration_days} days` : null
  return [interval, days, plan.description].filter(Boolean).join(' · ')
}

export default function CreateOrgModal({ onClose, onSubmit, saving }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [plans, setPlans] = useState([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [planId, setPlanId] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getAdminPlans()
      .then((body) => {
        if (cancelled) return
        const active = (body.plans || []).filter((item) => item.is_active !== false)
        setPlans(active)
        setPlanId((current) => current || active[0]?.id || '')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load plans')
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

    if (!planId) {
      setError(plans.length ? 'Choose a plan' : 'Create a plan before adding an organization')
      return
    }

    try {
      const result = await onSubmit({
        name: name.trim(),
        slug: slug.trim() || undefined,
        planId,
        ownerEmail: ownerEmail.trim(),
      })
      onClose()
      return result
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-modal-overlay admin-modal-overlay--popup" onClick={onClose}>
      <div
        className="admin-modal admin-modal--popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Organizations" />
            <h2 className="admin-modal__title">Create Organization</h2>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form className="admin-modal__form" onSubmit={handleSubmit}>
          <label className="admin-modal__field">
            <span className="admin-modal__label">Organization Name</span>
            <SpellcheckInput
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
              value={planId}
              onChange={setPlanId}
              options={plans}
              getOptionValue={(item) => item.id}
              getOptionLabel={planLabel}
              placeholder={plansLoading ? 'Loading plans...' : 'Select a plan'}
              disabled={plansLoading || plans.length === 0}
              allowEmpty={false}
            />
            <span className="admin-modal__hint">
              {plansLoading
                ? 'Loading plans...'
                : plans.length
                  ? planHint(plans.find((item) => item.id === planId))
                  : 'No active plans yet. Create one on the Plans page.'}
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
