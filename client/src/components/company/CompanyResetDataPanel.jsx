import { useEffect, useState } from 'react'
import {
  getCompanyResetTargets,
  requestCompanyResetOtp,
  confirmCompanyResetModule,
} from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import ResetOrgModuleModal from '../admin/ResetOrgModuleModal'
import '../admin/OrgResetPanel.css'

export default function CompanyResetDataPanel() {
  const { user } = useAuth()
  const [organization, setOrganization] = useState(null)
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [requestingOtp, setRequestingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpEmail, setOtpEmail] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getCompanyResetTargets()
      setOrganization(data?.organization || null)
      setTargets(data?.targets || [])
    } catch (err) {
      setError(err.message || 'Could not load reset targets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openReset = (target) => {
    setSelected(target)
    setOtpSent(false)
    setOtpEmail(user?.email || '')
    setError('')
    setSuccess('')
  }

  const handleRequestOtp = async () => {
    setRequestingOtp(true)
    setError('')
    try {
      const result = await requestCompanyResetOtp({ targetId: selected.id })
      setOtpSent(true)
      setOtpEmail(result?.email || user?.email || '')
    } finally {
      setRequestingOtp(false)
    }
  }

  const handleConfirm = async ({ otp, confirmName }) => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const result = await confirmCompanyResetModule({
        targetId: selected.id,
        otp,
        confirmName,
      })
      setSuccess(
        `Cleared ${result?.counts?.totalRows ?? 0} row(s) from ${result?.targetLabel || selected.label}.`,
      )
      setSelected(null)
      setOtpSent(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="company-loading">Loading reset options…</div>
  }

  return (
    <section className="company-panel org-reset-panel" style={{ marginTop: 24 }}>
      <div className="company-page__header" style={{ marginBottom: 12, padding: 0 }}>
        <div>
          <h2 className="company-page__title" style={{ fontSize: 18 }}>Reset Data</h2>
          <p className="company-page__subtitle">
            Permanently clear one module&apos;s records for this company. Requires email verification.
          </p>
        </div>
      </div>

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
              onClick={() => openReset(target)}
            >
              Reset
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <ResetOrgModuleModal
          org={organization}
          target={selected}
          mode="company"
          saving={saving}
          requestingOtp={requestingOtp}
          otpSent={otpSent}
          otpEmail={otpEmail}
          onClose={() => {
            if (saving || requestingOtp) return
            setSelected(null)
            setOtpSent(false)
          }}
          onRequestOtp={handleRequestOtp}
          onSubmit={handleConfirm}
        />
      )}
    </section>
  )
}
