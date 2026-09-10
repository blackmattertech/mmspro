import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import { getOrgStatusEntityTypes } from '../../lib/api-org-statuses'
import PageBack from '../../components/shared/PageBack'
import NavIcon from '../../components/layout/NavIcon'
import '../../components/company/CompanyShared.css'
import './Others.css'

const FALLBACK_TYPES = [
  { key: 'work_request', label: 'Work Request', description: 'Statuses used on work requests and their filters.' },
  { key: 'work_order', label: 'Work Order', description: 'Statuses for received, assigned, scheduled, and manual work orders.' },
  { key: 'task', label: 'Tasks & Follow-ups', description: 'Statuses available when creating or updating tasks.' },
  { key: 'pm_plan', label: 'Planned Maintenance', description: 'Active / inactive and custom statuses for PM plans.' },
]

export default function OthersStatusTypes() {
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
        const rows = await getOrgStatusEntityTypes()
        if (!cancelled && Array.isArray(rows) && rows.length) setTypes(rows)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load status types')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const backTo = org?.slug ? orgPath(org.slug, 'masters/others') : '#'

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <PageBack to={backTo} label="Others" />
        <h1 className="company-page__title">Status</h1>
        <p className="company-page__subtitle">
          Choose a request or order type to create and manage its statuses. These appear in status dropdowns.
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
              onClick={() => org?.slug && navigate(orgPath(org.slug, `masters/others/status/${type.key}`))}
            >
              <span className="others-hub__icon" aria-hidden="true">
                <NavIcon name="document" />
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
