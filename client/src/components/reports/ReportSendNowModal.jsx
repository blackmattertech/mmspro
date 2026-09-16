import { useState } from 'react'
import { useBackdropClose } from '../../hooks/useBackdropClose'
import SpellcheckInput from '../shared/SpellcheckInput'
import '../company/CompanyShared.css'
import './ReportsLayout.css'

export default function ReportSendNowModal({
  title,
  defaultEmails = '',
  sending = false,
  onSend,
  onClose,
}) {
  const [emails, setEmails] = useState(defaultEmails)
  const [error, setError] = useState(null)
  const handleBackdropClick = useBackdropClose(onClose)

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    try {
      await onSend(emails)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="company-modal-overlay company-modal-overlay--popup" onClick={handleBackdropClick} role="presentation">
      <div
        className="company-modal company-modal--popup"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-send-now-title"
      >
        <div className="company-modal__header">
          <h2 id="report-send-now-title">Send {title} now</h2>
          <button type="button" className="company-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="company-modal__form" onSubmit={submit}>
          <p className="company-modal__hint">
            Sends the saved custom report for the current period as PDF and CSV.
          </p>
          {error && <div className="company-alert" role="alert">{error}</div>}
          <div className="company-form__field company-form__field--full">
            <label className="company-form__label" htmlFor="send-now-emails">Recipients</label>
            <SpellcheckInput
              multiline
              id="send-now-emails"
              className="company-form__input company-form__textarea"
              rows={4}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              placeholder="one@company.com, two@company.com"
              required
            />
          </div>
          <div className="company-modal__actions">
            <button type="button" className="company-btn company-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="company-btn company-btn--primary" disabled={sending}>
              {sending ? 'Sending…' : 'Send now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
