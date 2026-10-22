import { useEffect, useState } from 'react'
import { companyFetch } from '../../lib/api'
import { usePermissions } from '../../hooks/usePermissions'
import '../../components/company/CompanyShared.css'

const LEAD_PRESETS = [7, 10, 15, 30]

export default function OrgSettings() {
  const { canUpdate } = usePermissions()
  const canEdit = canUpdate('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [leadPreset, setLeadPreset] = useState('7')
  const [customLead, setCustomLead] = useState('14')

  useEffect(() => {
    let cancelled = false
    companyFetch('/settings')
      .then((row) => {
        if (cancelled) return
        const days = Number(row?.warranty_expiry_lead_days) || 7
        if (LEAD_PRESETS.includes(days)) {
          setLeadPreset(String(days))
        } else {
          setLeadPreset('custom')
          setCustomLead(String(days))
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load settings')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const leadDays = leadPreset === 'custom' ? Number(customLead) : Number(leadPreset)

  const save = async (event) => {
    event.preventDefault()
    if (!canEdit) return
    if (!Number.isFinite(leadDays) || leadDays < 1 || leadDays > 365) {
      setError('Warranty lead days must be between 1 and 365.')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await companyFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          warranty_expiry_lead_days: leadDays,
        }),
      })
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="company-loading">Loading settings…</div>

  return (
    <div className="company-page">
      <header className="company-page__header">
        <div>
          <h1 className="company-page__title">Settings</h1>
          <p className="company-page__subtitle">Warranty expiry alerts</p>
        </div>
      </header>
      <div className="company-page__content">
        {error && <div className="company-alert">{error}</div>}
        {saved && <div className="company-alert company-alert--success">Settings saved.</div>}
        <form className="company-panel" onSubmit={save}>
          <label className="company-form__field">
            <span className="company-form__label">Warranty expiry lead</span>
            <select
              className="company-form__input"
              value={leadPreset}
              onChange={(event) => setLeadPreset(event.target.value)}
              disabled={!canEdit}
            >
              {LEAD_PRESETS.map((days) => (
                <option key={days} value={String(days)}>{days} days</option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {leadPreset === 'custom' && (
            <label className="company-form__field">
              <span className="company-form__label">Custom lead days</span>
              <input
                className="company-form__input"
                type="number"
                min="1"
                max="365"
                value={customLead}
                onChange={(event) => setCustomLead(event.target.value)}
                disabled={!canEdit}
              />
            </label>
          )}
          <p className="company-readonly-note">
            A warranty’s own notification days override this default. The daily job emails company admins and the warranty contact, then creates one task due on the warranty end date.
          </p>
          {canEdit && (
            <button type="submit" className="company-btn company-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
