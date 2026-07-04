import { useEffect } from 'react'
import './LimitExceededCard.css'

export default function LimitExceededCard({ resource = 'Resource', onClose }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="limit-exceeded-overlay" onClick={onClose} role="presentation">
      <div
        className="limit-exceeded-card"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="limit-exceeded-title"
        aria-describedby="limit-exceeded-desc"
      >
        <div className="limit-exceeded-card__icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2.5" />
            <path d="M24 14V26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <circle cx="24" cy="33" r="2" fill="currentColor" />
          </svg>
        </div>
        <h2 id="limit-exceeded-title" className="limit-exceeded-card__title">
          Limit Exceeded
        </h2>
        <p className="limit-exceeded-card__resource">
          Your {resource.toLowerCase()} limit has been reached.
        </p>
        <p id="limit-exceeded-desc" className="limit-exceeded-card__message">
          Please contact your Administrator to increase the limit.
        </p>
        <button type="button" className="limit-exceeded-card__btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
