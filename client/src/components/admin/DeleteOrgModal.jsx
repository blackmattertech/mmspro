import { useState } from 'react'
import PageBack from '../shared/PageBack'
import './CreateOrgModal.css'
import './DeleteOrgModal.css'

export default function DeleteOrgModal({ org, onClose, onSubmit, saving }) {
  const [password, setPassword] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState(null)

  const nameMatches = confirmName.trim() === (org?.name || '').trim()
  const canSubmit = Boolean(password) && nameMatches && !saving

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!nameMatches) {
      setError('Type the exact company name to confirm.')
      return
    }
    if (!password) {
      setError('Enter your Super Admin password.')
      return
    }
    try {
      await onSubmit(org.id, { password })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not delete organization')
    }
  }

  return (
    <div className="admin-modal-overlay admin-modal-overlay--popup" onClick={onClose}>
      <div
        className="admin-modal admin-modal--popup delete-org-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-org-title"
      >
        <div className="admin-modal__header">
          <div className="modal__header-main">
            <PageBack onClick={onClose} className="page-back--header" label="Organizations" />
            <h2 id="delete-org-title" className="admin-modal__title">Delete Organization</h2>
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
            This permanently deletes <strong>{org?.name}</strong>
            {org?.slug ? <> (/{org.slug})</> : null}, including users, work requests, work orders,
            assets, forms, and uploaded files.
          </div>

          {org?.id && (
            <p className="admin-modal__hint delete-org-modal__id">
              Organization ID: <code>{org.id}</code>
            </p>
          )}

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
              {saving ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
