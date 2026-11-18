import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDuration } from '../../../../shared/supportTickets.js'
import PageBack from '../../components/shared/PageBack'
import FormLabel from '../../components/shared/FormLabel'
import { getSupportSla, saveSupportSla } from '../../lib/supportApi'
import '../../components/company/CompanyShared.css'
import './AdminPage.css'

export default function SupportSla() {
  const navigate = useNavigate()
  const [policies, setPolicies] = useState([])
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSupportSla()
      .then((data) => {
        setPolicies(data.policies || [])
        setSettings(data.settings)
      })
      .catch((err) => setError(err.message || 'Could not load SLA policy'))
      .finally(() => setLoading(false))
  }, [])

  const updatePolicy = (priority, key, value) => {
    setPolicies((rows) => rows.map((row) => (
      row.priority === priority ? { ...row, [key]: value } : row
    )))
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved('')
    try {
      const next = await saveSupportSla({
        policies: policies.map((row) => ({
          priority: row.priority,
          first_response_minutes: Number(row.first_response_minutes),
          resolution_minutes: Number(row.resolution_minutes),
          is_active: row.is_active !== false,
        })),
        settings,
      })
      setPolicies(next.policies || [])
      setSettings(next.settings)
      setSaved('SLA policy saved. New tickets use these targets.')
    } catch (err) {
      setError(err.message || 'Could not save SLA policy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <PageBack onClick={() => navigate('/admin/support')} label="Support Management" />
          <h1 className="admin-page__title">SLA policy</h1>
          <p className="admin-page__subtitle">
            Response and resolution targets apply as continuous minutes. Waiting for Customer pauses the clock when that rule is on.
          </p>
        </div>
      </header>

      <div className="admin-page__content">
        {loading && <div className="admin-loading">Loading SLA policy…</div>}
        {error && <div className="admin-alert">{error}</div>}
        {saved && <div className="admin-alert admin-alert--success">{saved}</div>}

        {!loading && settings && (
          <form className="admin-card" onSubmit={save}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>First response (minutes)</th>
                    <th>Resolution (minutes)</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.priority}>
                      <td>
                        <div className="admin-table__name">{policy.label}</div>
                        <div className="admin-table__slug">{policy.description}</div>
                        <div className="admin-table__slug">
                          Default window {formatDuration(policy.resolution_minutes * 60 * 1000)}
                        </div>
                      </td>
                      <td>
                        <input
                          className="company-form__input"
                          aria-label={`${policy.label} first response minutes`}
                          type="number"
                          min="5"
                          max="10080"
                          value={policy.first_response_minutes}
                          onChange={(event) => updatePolicy(policy.priority, 'first_response_minutes', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="company-form__input"
                          aria-label={`${policy.label} resolution minutes`}
                          type="number"
                          min="5"
                          max="43200"
                          value={policy.resolution_minutes}
                          onChange={(event) => updatePolicy(policy.priority, 'resolution_minutes', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${policy.label} active`}
                          type="checkbox"
                          checked={policy.is_active !== false}
                          onChange={(event) => updatePolicy(policy.priority, 'is_active', event.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: 20 }}>
              <h3 className="admin-page__title" style={{ fontSize: 16, marginBottom: 12 }}>Clock rules</h3>
              <label className="company-form__field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.pause_on_waiting)}
                  onChange={(event) => setSettings({ ...settings, pause_on_waiting: event.target.checked })}
                />
                Pause the SLA while status is Waiting for Customer
              </label>
              <label className="company-form__field">
                <FormLabel>Auto-close resolved tickets after (hours)</FormLabel>
                <input
                  className="company-form__input"
                  type="number"
                  min="1"
                  max="720"
                  value={settings.auto_close_hours}
                  onChange={(event) => setSettings({ ...settings, auto_close_hours: Number(event.target.value) })}
                />
              </label>
              <label className="company-form__field">
                <FormLabel>Business hours label</FormLabel>
                <input
                  className="company-form__input"
                  value={settings.business_hours_label}
                  maxLength={120}
                  onChange={(event) => setSettings({ ...settings, business_hours_label: event.target.value })}
                />
              </label>
              <p className="admin-page__subtitle">
                Shown as the operating window. Timers still count the saved minutes continuously, then pause only for Waiting for Customer.
              </p>
              <button className="company-btn company-btn--primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save SLA policy'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
