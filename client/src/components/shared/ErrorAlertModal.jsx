import './ConfirmDeleteModal.css'
import './ErrorAlertModal.css'

export default function ErrorAlertModal({
  open,
  title = 'Something went wrong',
  message,
  details = [],
  confirmLabel = 'OK',
  onClose,
}) {
  if (!open) return null

  const items = (details || []).map((item) => String(item || '').trim()).filter(Boolean)

  return (
    <div
      className="company-modal-overlay confirm-delete-overlay error-alert-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        className="company-modal confirm-delete-modal error-alert-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-alert-title"
        aria-describedby="error-alert-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <h2 id="error-alert-title">{title}</h2>
          <button
            type="button"
            className="company-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="confirm-delete-modal__body">
          {message ? (
            <div id="error-alert-message" className="error-alert-modal__banner" role="alert">
              {message}
            </div>
          ) : null}
          {items.length > 0 && (
            <ul className="error-alert-modal__list">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <div className="company-modal__actions confirm-delete-modal__actions">
            <button
              type="button"
              className="company-btn company-btn--primary"
              onClick={onClose}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
