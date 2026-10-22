import { useEffect, useState } from 'react'
import {
  LIMIT_ITEMS,
  PLAN_DEFAULTS,
  formatUsage,
  isAtOrOverLimit,
  limitInputValue,
} from '../../lib/orgLimits'
import { getAdminPlans } from '../../lib/api'
import FilterableSelect from '../ui/FilterableSelect'
import './CreateOrgModal.css'
import './OrgLimitsModal.css'

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
  const [plans, setPlans] = useState([])
  const [planId, setPlanId] = useState('')
  const [plansLoading, setPlansLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getAdminPlans()
      .then((body) => {
        if (cancelled) return
        const active = (body.plans || []).filter((item) => item.is_active !== false)
        const current = active.find((item) => item.name === org.plan || item.code === org.plan)
        setPlans(active)
        setPlanId(current?.id || active[0]?.id || '')
      })
      .catch(() => {
        if (!cancelled) setPlans([])
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [org.plan])

  const selectedPlan = plans.find((item) => item.id === planId)
  const plan = selectedPlan?.name || org.plan || 'free'
  const [limits, setLimits] = useState(() =>
    Object.fromEntries(
      LIMIT_ITEMS.map((item) => [item.key, limitInputValue(org[item.key])])
    )
  )
  const [applyPlanLimits, setApplyPlanLimits] = useState(false)
  const [error, setError] = useState(null)

  const handlePlanChange = (nextPlanId) => {
    setPlanId(nextPlanId)
    const nextName = plans.find((item) => item.id === nextPlanId)?.name
    if (applyPlanLimits && PLAN_DEFAULTS[nextName]) {
      const defaults = PLAN_DEFAULTS[nextName]
      setLimits(
        Object.fromEntries(
          LIMIT_ITEMS.map((item) => [item.key, limitInputValue(defaults[item.key])])
        )
      )
    }
  }

  const handleApplyPlanToggle = (checked) => {
    setApplyPlanLimits(checked)
    if (checked && PLAN_DEFAULTS[plan]) {
      const defaults = PLAN_DEFAULTS[plan]
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
      planId: planId || undefined,
      plan,
      apply_plan_limits: applyPlanLimits && Boolean(PLAN_DEFAULTS[plan]),
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
    <div className="admin-modal-overlay admin-modal-overlay--popup" onClick={onClose}>
      <div
        className="admin-modal admin-modal--popup"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-limits-modal-title"
      >
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <div>
              <h2 id="org-limits-modal-title" className="admin-modal__title">Organization Limits</h2>
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
              value={planId}
              onChange={handlePlanChange}
              options={plans}
              getOptionValue={(item) => item.id}
              getOptionLabel={planLabel}
              placeholder={plansLoading ? 'Loading plans...' : 'Select a plan'}
              disabled={plansLoading || plans.length === 0}
              allowEmpty={false}
            />
          </label>

          {PLAN_DEFAULTS[plan] && (
            <label className="org-limits-modal__checkbox">
              <input
                type="checkbox"
                checked={applyPlanLimits}
                onChange={(e) => handleApplyPlanToggle(e.target.checked)}
              />
              <span>Apply default limits for selected plan on save</span>
            </label>
          )}

          {(!applyPlanLimits || !PLAN_DEFAULTS[plan]) && LIMIT_ITEMS.map((item) => (
            <LimitField
              key={item.key}
              item={item}
              value={limits[item.key]}
              usage={org.usage}
              onChange={(value) => setLimits((prev) => ({ ...prev, [item.key]: value }))}
            />
          ))}

          {applyPlanLimits && PLAN_DEFAULTS[plan] && (
            <div className="org-limits-modal__preview">
              <p className="org-limits-modal__preview-title">Plan defaults</p>
              <ul className="org-limits-modal__preview-list">
                {LIMIT_ITEMS.map((item) => {
                  const defaults = PLAN_DEFAULTS[plan]
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
