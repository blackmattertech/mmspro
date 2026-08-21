import { useState } from 'react'
import {
  LIMIT_ITEMS,
  PLAN_DEFAULTS,
  formatUsage,
  isAtOrOverLimit,
  limitInputValue,
} from '../../lib/orgLimits'
import FilterableSelect from '../ui/FilterableSelect'
import PageBack from '../shared/PageBack'
import '../../components/company/CompanyShared.css'
import './CreateOrgModal.css'
import './OrgLimitsModal.css'

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

function LimitField({ item, value, usage, onChange }) {
  const atLimit = isAtOrOverLimit(usage?.[item.usageKey], value === '' ? null : Number(value))

  return (
    <label className="admin-modal__field org-limits-field">
      <span className="admin-modal__label">{item.label}</span>
      <div className="org-limits-field__row">
        <input
          type="number"
          min="0"
          className="admin-modal__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Unlimited"
        />
        <span className={`org-limits-field__usage ${atLimit ? 'org-limits-field__usage--warn' : ''}`}>
          Used: {formatUsage(usage?.[item.usageKey], value === '' ? null : Number(value))}
        </span>
      </div>
      <span className="admin-modal__hint">Leave empty for unlimited</span>
    </label>
  )
}

export default function OrgLimitsModal({ org, onClose, onSubmit, saving }) {
  const [plan, setPlan] = useState(org.plan || 'free')
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(
      LIMIT_ITEMS.map((item) => [item.key, limitInputValue(org[item.key])])
    )
  )
  const [applyPlanLimits, setApplyPlanLimits] = useState(false)
  const [error, setError] = useState(null)

  const handlePlanChange = (nextPlan) => {
    setPlan(nextPlan)
    if (applyPlanLimits) {
      const defaults = PLAN_DEFAULTS[nextPlan] || PLAN_DEFAULTS.free
      setLimits(
        Object.fromEntries(
          LIMIT_ITEMS.map((item) => [item.key, limitInputValue(defaults[item.key])])
        )
      )
    }
  }

  const handleApplyPlanToggle = (checked) => {
    setApplyPlanLimits(checked)
    if (checked) {
      const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free
      setLimits(
        Object.fromEntries(
          LIMIT_ITEMS.map((item) => [item.key, limitInputValue(defaults[item.key])])
        )
      )
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const payload = {
      plan,
      apply_plan_limits: applyPlanLimits,
    }

    if (!applyPlanLimits) {
      for (const item of LIMIT_ITEMS) {
        payload[item.key] = limits[item.key]
      }
    }

    try {
      await onSubmit(org.id, payload)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Organizations" />
            <div>
              <h2 className="admin-modal__title">Organization Limits</h2>
              <p className="org-limits-modal__subtitle">{org.name}</p>
            </div>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form className="admin-modal__form" onSubmit={handleSubmit}>
          <label className="admin-modal__field">
            <span className="admin-modal__label">Plan</span>
            <FilterableSelect
              inputClassName="admin-modal__input"
              value={plan}
              onChange={handlePlanChange}
              options={PLANS}
              getOptionValue={(p) => p.value}
              getOptionLabel={(p) => p.label}
              allowEmpty={false}
            />
          </label>

          <label className="org-limits-modal__checkbox">
            <input
              type="checkbox"
              checked={applyPlanLimits}
              onChange={(e) => handleApplyPlanToggle(e.target.checked)}
            />
            <span>Apply default limits for selected plan on save</span>
          </label>

          {!applyPlanLimits && LIMIT_ITEMS.map((item) => (
            <LimitField
              key={item.key}
              item={item}
              value={limits[item.key]}
              usage={org.usage}
              onChange={(value) => setLimits((prev) => ({ ...prev, [item.key]: value }))}
            />
          ))}

          {applyPlanLimits && (
            <div className="org-limits-modal__preview">
              <p className="org-limits-modal__preview-title">Plan defaults</p>
              <ul className="org-limits-modal__preview-list">
                {LIMIT_ITEMS.map((item) => {
                  const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free
                  return (
                    <li key={item.key}>
                      <span>{item.label}</span>
                      <span>{formatUsage(org.usage?.[item.usageKey], defaults[item.key])}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {error && <p className="admin-modal__error">{error}</p>}

          <div className="admin-modal__actions">
            <button type="button" className="admin-modal__btn admin-modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-modal__btn admin-modal__btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Limits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
