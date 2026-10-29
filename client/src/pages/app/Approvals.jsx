import { useEffect, useState } from 'react'
import { companyFetch } from '../../lib/api'
import { usePermissions } from '../../hooks/usePermissions'
import { APPROVAL_MODULES } from '../../lib/moduleApprovals'
import GooToggle from '../../components/ui/GooToggle'
import '../../components/company/CompanyShared.css'
import './Approvals.css'

export default function Approvals() {
  const { canUpdate, isProductEnabled } = usePermissions()
  const canEdit = canUpdate('approvals')
  const modules = APPROVAL_MODULES.filter((mod) => isProductEnabled(mod.id))
  const [loading, setLoading] = useState(true)
  const [approvals, setApprovals] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    companyFetch('/settings')
      .then((row) => {
        if (cancelled) return
        setApprovals(row?.module_approvals && typeof row.module_approvals === 'object'
          ? row.module_approvals
          : {})
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load approvals')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleToggle = async (moduleId, required) => {
    if (!canEdit) return
    const previous = approvals
    const next = { ...previous, [moduleId]: required }
    setApprovals(next)
    setSavingId(moduleId)
    setError('')
    try {
      const saved = await companyFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ module_approvals: { [moduleId]: required } }),
      })
      setApprovals(saved?.module_approvals && typeof saved.module_approvals === 'object'
        ? saved.module_approvals
        : next)
    } catch (err) {
      setApprovals(previous)
      setError(err.message || 'Could not save approvals')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div className="company-loading">Loading approvals…</div>

  return (
    <div className="company-page">
      <header className="company-page__header">
        <div>
          <h1 className="company-page__title">Approvals</h1>
          <p className="company-page__subtitle">
            Choose which modules need department head approval
          </p>
        </div>
      </header>
      <div className="company-page__content">
        {error && <div className="company-alert">{error}</div>}
        {!modules.length ? (
          <div className="company-empty">No modules are available to configure.</div>
        ) : (
          <ul className="approval-list">
            {modules.map((mod) => {
              const required = mod.id === 'work_request'
                ? approvals[mod.id] !== false
                : approvals[mod.id] === true
              return (
                <li key={mod.id} className="approval-list__row">
                  <div className="approval-list__copy">
                    <span className="approval-list__label">{mod.label}</span>
                    <span className="approval-list__hint">{mod.hint}</span>
                  </div>
                  <GooToggle
                    checked={required}
                    disabled={!canEdit || savingId === mod.id}
                    onChange={(checked) => handleToggle(mod.id, checked)}
                    ariaLabel={`${required ? 'Require' : 'Skip'} department head approval for ${mod.label}`}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
