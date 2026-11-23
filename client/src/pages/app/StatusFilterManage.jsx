import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { canManageOrg, isCompanyAdmin } from '../../lib/accountRoles'
import {
  getStatusFilterModule,
  resetStatusFilterMappings,
  saveStatusFilterMappings,
} from '../../lib/api-status-filters'
import { seedReferenceData } from '../../lib/referenceDataCache'
import PageBack from '../../components/shared/PageBack'
import '../../components/company/CompanyShared.css'
import './Others.css'
import './StatusFilterManage.css'

const UNMAPPED = ''

export default function StatusFilterManage() {
  const { entityType } = useParams()
  const { org } = useOrg()
  const { role } = useAuth()
  const { canCreate, canUpdate, canDelete, isOrgAdmin } = usePermissions()
  const canEdit = (
    isOrgAdmin
    || isCompanyAdmin(role)
    || canManageOrg(role)
    || canUpdate('assets')
    || canCreate('others')
    || canUpdate('others')
    || canDelete('others')
  )

  const [module, setModule] = useState(null)
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const backTo = org?.slug ? orgPath(org.slug, 'masters/status-filters') : '#'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getStatusFilterModule(entityType)
      setModule(data)
      setDraft(data.mapping_by_status || {})
      seedReferenceData('status-phase-maps', { entityType }, data.mappings || [])
    } catch (err) {
      setError(err.message || 'Could not load status filter mappings')
      setModule(null)
    } finally {
      setLoading(false)
    }
  }, [entityType])

  useEffect(() => {
    load()
  }, [load])

  const unmappedCount = useMemo(() => {
    const statuses = module?.statuses || []
    return statuses.filter((row) => !draft[row.key]).length
  }, [module, draft])

  const dirty = useMemo(() => {
    const current = module?.mapping_by_status || {}
    const keys = new Set([...Object.keys(current), ...Object.keys(draft)])
    for (const key of keys) {
      if ((current[key] || '') !== (draft[key] || '')) return true
    }
    return false
  }, [module, draft])

  const setMapping = (statusKey, phaseId) => {
    setDraft((prev) => {
      const next = { ...prev }
      if (!phaseId) delete next[statusKey]
      else next[statusKey] = phaseId
      return next
    })
    setNotice(null)
  }

  const handleSave = async () => {
    if (!canEdit || !module) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const mappings = (module.statuses || []).map((row) => ({
        status_key: row.key,
        phase_id: draft[row.key] || null,
      }))
      const saved = await saveStatusFilterMappings(entityType, mappings)
      setModule(saved)
      setDraft(saved.mapping_by_status || {})
      seedReferenceData('status-phase-maps', { entityType }, saved.mappings || [])
      setNotice('Status filter mappings saved.')
    } catch (err) {
      setError(err.message || 'Could not save mappings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!canEdit) return
    if (!window.confirm('Reset this module to the default pill mappings?')) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await resetStatusFilterMappings(entityType)
      setModule(saved)
      setDraft(saved.mapping_by_status || {})
      seedReferenceData('status-phase-maps', { entityType }, saved.mappings || [])
      setNotice('Mappings reset to defaults.')
    } catch (err) {
      setError(err.message || 'Could not reset mappings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="company-loading">Loading status filter…</div>
  }

  if (!module) {
    return (
      <div className="company-page">
        <PageBack to={backTo} label="Status Filter" />
        {error && <div className="company-alert" role="alert">{error}</div>}
      </div>
    )
  }

  return (
    <div className="company-page status-filter-page">
      <header className="company-page__header">
        <div className="company-page__header-bar">
          <div className="company-page__header-main">
            <PageBack to={backTo} label="Status Filter" />
            <h1 className="company-page__title">{module.label}</h1>
            <p className="company-page__subtitle">
              {module.description || 'Assign each status to one list pill. Unmapped statuses only appear under All.'}
            </p>
          </div>
          {canEdit && (
            <div className="company-page__header-actions">
              <button
                type="button"
                className="company-btn company-btn--secondary"
                onClick={handleReset}
                disabled={saving}
              >
                Reset defaults
              </button>
              <button
                type="button"
                className="company-btn company-btn--primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="company-page__content">
        {error && <div className="company-alert" role="alert">{error}</div>}
        {notice && <div className="company-alert company-alert--success" role="status">{notice}</div>}

        <div className="status-filter-pills" aria-label="Pill filters">
          {(module.phases || []).map((phase) => (
            <span
              key={phase.id}
              className="status-filter-pills__item"
              style={{ '--pill-color': phase.color }}
            >
              <span className="status-filter-pills__dot" aria-hidden="true" />
              {phase.label}
            </span>
          ))}
        </div>

        {unmappedCount > 0 && (
          <p className="status-filter-warning" role="status">
            {unmappedCount} status{unmappedCount === 1 ? '' : 'es'} unmapped — only counted under All.
          </p>
        )}

        <div className="company-panel status-filter-table-wrap">
          <table className="company-table status-filter-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Pill filter</th>
              </tr>
            </thead>
            <tbody>
              {(module.statuses || []).map((row) => (
                <tr key={row.key} className={row.is_active === false ? 'is-inactive' : undefined}>
                  <td>
                    <span className="status-filter-status">
                      <span
                        className="status-filter-status__dot"
                        style={{ background: row.color || '#94A3B8' }}
                        aria-hidden="true"
                      />
                      <span className="status-filter-status__text">
                        <strong>{row.name}</strong>
                        <span className="status-filter-status__key">{row.key}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <select
                      className="company-form__input company-form__input--select"
                      value={draft[row.key] || UNMAPPED}
                      disabled={!canEdit || saving}
                      onChange={(e) => setMapping(row.key, e.target.value)}
                      aria-label={`Pill for ${row.name}`}
                    >
                      <option value={UNMAPPED}>Unmapped</option>
                      {(module.phases || []).map((phase) => (
                        <option key={phase.id} value={phase.id}>{phase.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
