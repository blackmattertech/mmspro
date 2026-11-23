import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { getStatusFilterEntityTypes } from '../../lib/api-status-filters'
import MastersBack from '../../components/company/MastersBack'
import NavIcon from '../../components/layout/NavIcon'
import '../../components/company/CompanyShared.css'
import './Others.css'

const FALLBACK_TYPES = [
  { key: 'work_request', label: 'Work Request', description: 'Map work request display statuses to list pills.' },
  { key: 'work_order', label: 'Work Order', description: 'Map work order statuses to list pills.' },
  { key: 'task', label: 'Tasks & Follow-ups', description: 'Map task statuses to list pills.' },
  { key: 'pm_plan', label: 'Planned Maintenance', description: 'Map PM plan statuses to Inactive / Active / Overdue.' },
  { key: 'warranty', label: 'Warranty', description: 'Map warranty status buckets to warranty tabs.' },
]

export default function StatusFilterModules() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const [types, setTypes] = useState(FALLBACK_TYPES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await getStatusFilterEntityTypes()
        if (!cancelled && Array.isArray(rows) && rows.length) setTypes(rows)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load status filter modules')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <MastersBack />
        <h1 className="company-page__title">Status Filter</h1>
        <p className="company-page__subtitle">
          Choose a module, then map each status to a list pill so filters and counts stay accurate.
        </p>
      </header>

      {error && <div className="company-alert">{error}</div>}
      {loading ? (
        <div className="company-loading">Loading…</div>
      ) : (
        <div className="others-hub">
          {types.map((type) => (
            <button
              key={type.key}
              type="button"
              className="others-hub__card"
              onClick={() => org?.slug && navigate(orgPath(org.slug, `masters/status-filters/${type.key}`))}
            >
              <span className="others-hub__icon" aria-hidden="true">
                <NavIcon name="alarmCheck" />
              </span>
              <span className="others-hub__body">
                <span className="others-hub__title">{type.label}</span>
                <span className="others-hub__desc">{type.description}</span>
              </span>
              <span className="others-hub__chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
