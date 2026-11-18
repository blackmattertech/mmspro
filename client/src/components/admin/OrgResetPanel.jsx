import { useEffect, useState } from 'react'
import { getOrgResetTargets, resetOrgModule } from '../../lib/api'
import ResetOrgModuleModal from './ResetOrgModuleModal'
import './OrgResetPanel.css'

export default function OrgResetPanel({ org }) {
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!org?.id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getOrgResetTargets(org.id)
      setTargets(data?.targets || [])
    } catch (err) {
      setError(err.message || 'Could not load reset targets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [org?.id])

  const handleReset = async ({ password }) => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await resetOrgModule(org.id, {
        targetId: selected.id,
        password,
      })
      setSuccess(
        `Cleared ${result?.counts?.totalRows ?? 0} row(s) from ${result?.targetLabel || selected.label}.`,
      )
      setSelected(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="company-empty">Loading reset targets…</p>

  return (
    <div className="org-reset-panel">
      <p className="org-reset-panel__hint">
        Clear one module&apos;s data for this company only. Users, roles, and other modules are not removed.
      </p>
      {error && <div className="company-alert">{error}</div>}
      {success && <div className="company-alert company-alert--success">{success}</div>}
      <ul className="org-reset-panel__list">
        {targets.map((target) => (
          <li key={target.id} className="org-reset-panel__row">
            <div className="org-reset-panel__copy">
              <div className="org-reset-panel__title-row">
                <span className="org-reset-panel__title">{target.label}</span>
                <span className="org-reset-panel__count">{target.totalRows || 0} rows</span>
              </div>
              <div className="org-reset-panel__tables">
                {(target.tables || []).map((table) => (
                  <span key={table.name} className="org-reset-panel__chip">
                    {table.label || table.name}
                    <em>{table.count || 0}</em>
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="org-reset-panel__action"
              onClick={() => setSelected(target)}
              disabled={!org?.id}
            >
              Reset
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <ResetOrgModuleModal
          org={org}
          target={selected}
          saving={saving}
          mode="superadmin"
          onClose={() => !saving && setSelected(null)}
          onSubmit={handleReset}
        />
      )}
    </div>
  )
}
