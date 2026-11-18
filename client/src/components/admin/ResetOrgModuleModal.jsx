import { useState } from 'react'
import PageBack from '../shared/PageBack'
import './CreateOrgModal.css'
import './DeleteOrgModal.css'

export default function ResetOrgModuleModal({
  org,
  target,
  onClose,
  onSubmit,
  saving,
  mode = 'superadmin',
  otpEmail = '',
  onRequestOtp,
  requestingOtp = false,
  otpSent = false,
}) {
  const [password, setPassword] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState(null)

  const nameMatches = confirmName.trim() === (org?.name || '').trim()
  const isCompanyAdmin = mode === 'company'
  const canSubmit = Boolean(
    nameMatches
    && !saving
    && (isCompanyAdmin ? (otpSent && /^\d{6}$/.test(otp.trim())) : password),
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!nameMatches) {
      setError('Type the exact company name to confirm.')
      return
    }
    if (isCompanyAdmin) {
      if (!otpSent) {
        setError('Send a verification code to your email first.')
        return
      }
      if (!/^\d{6}$/.test(otp.trim())) {
        setError('Enter the 6-digit code from your email.')
        return
      }
    } else if (!password) {
      setError('Enter your Super Admin password.')
      return
    }
    try {
      await onSubmit({
        password,
        otp: otp.trim(),
        confirmName: confirmName.trim(),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not reset module data')
    }
  }

  const handleRequestOtp = async () => {
    setError(null)
    if (!nameMatches) {
      setError('Type the exact company name to confirm before sending the code.')
      return
    }
    try {
      await onRequestOtp?.({ confirmName: confirmName.trim() })
    } catch (err) {
      setError(err.message || 'Could not send verification code')
    }
  }

  const tableList = (target?.tables || [])
    .map((row) => `${row.label || row.name} (${row.count || 0})`)
    .join(', ')

  return (
    <div className="admin-modal-overlay admin-modal-overlay--popup" onClick={onClose}>
      <div
        className="admin-modal admin-modal--popup delete-org-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-org-module-title"
      >
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Back" />
            <h2 id="reset-org-module-title" className="admin-modal__title">
              Reset {target?.label || 'module'}
            </h2>
          </div>
          <button type="button" className="admin-modal__close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="admin-modal__form delete-org-modal__form" onSubmit={handleSubmit}>
          <div className="delete-org-modal__irreversible" role="alert">
            <strong>Once deleted, this data cannot be retrieved.</strong>
          </div>

          <div className="delete-org-modal__warning">
            This permanently clears <strong>{target?.label}</strong> data for{' '}
            <strong>{org?.name}</strong>
            {org?.slug ? <> (/{org.slug})</> : null}
            {' '}only. Other modules, users, and roles are not removed.
            {tableList ? (
              <>
                <br />
                Tables: {tableList}.
              </>
            ) : null}
            {(target?.sideEffectNotes || []).map((note) => (
              <span key={note}>
                <br />
                {note}
              </span>
            ))}
          </div>

          <label className="admin-modal__field">
            <span className="admin-modal__label">Type the company name to confirm</span>
            <input
              type="text"
              className="admin-modal__input"
              value={confirmName}
              onChange={(e) => {
                setConfirmName(e.target.value)
                setError(null)
              }}
              placeholder={org?.name || 'Company name'}
              autoFocus
              autoComplete="off"
            />
          </label>

          {isCompanyAdmin ? (
            <>
              <div className="admin-modal__field">
                <span className="admin-modal__label">Email verification</span>
                <p className="admin-modal__hint" style={{ marginTop: 4 }}>
                  {otpSent
                    ? `A code was sent to ${otpEmail || 'your email'}.`
                    : `We will send a 6-digit code to ${otpEmail || 'your email'}.`}
                </p>
                <button
                  type="button"
                  className="admin-modal__btn admin-modal__btn--secondary"
                  onClick={handleRequestOtp}
                  disabled={requestingOtp || !nameMatches}
                >
                  {requestingOtp ? 'Sending…' : otpSent ? 'Resend code' : 'Send verification code'}
                </button>
              </div>
              <label className="admin-modal__field">
                <span className="admin-modal__label">Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="admin-modal__input"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setError(null)
                  }}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                  disabled={!otpSent}
                />
              </label>
            </>
          ) : (
            <label className="admin-modal__field">
              <span className="admin-modal__label">Your Super Admin password</span>
              <input
                type="password"
                className="admin-modal__input"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </label>
          )}

          {error && <p className="admin-modal__error">{error}</p>}

          <div className="admin-modal__actions">
            <button type="button" className="admin-modal__btn admin-modal__btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-modal__btn admin-modal__btn--danger"
              disabled={!canSubmit}
            >
              {saving ? 'Resetting…' : 'Reset permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
