import './ConfirmDeleteModal.css'

export default function ConfirmDeleteModal({
  open,
  title = 'Confirm delete',
  message,
  busy = false,
  confirmLabel = 'OK Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
}) {
  if (!open) return null

  return (
    <div
      className="company-modal-overlay confirm-delete-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.()
      }}
    >
      <div
        className="company-modal confirm-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="company-modal__header">
          <h2 id="confirm-delete-title">{title}</h2>
          <button
            type="button"
            className="company-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="confirm-delete-modal__body">
          <div className="confirm-delete-modal__irreversible" role="alert">
            Once deleted, this data cannot be retrieved.
          </div>
          {message ? <p className="confirm-delete-modal__message">{message}</p> : null}
          <div className="company-modal__actions confirm-delete-modal__actions">
            <button
              type="button"
              className="company-btn company-btn--secondary"
              onClick={onClose}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className="company-btn company-btn--danger"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Deleting…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
