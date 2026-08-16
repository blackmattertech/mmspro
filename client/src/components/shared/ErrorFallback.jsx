import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import './ErrorFallback.css'

export default function ErrorFallback({ error, onRetry, variant = 'app' }) {
  const navigate = useNavigate()
  const { org } = useOrg()

  const goHome = () => {
    if (variant === 'admin') {
      navigate('/admin/dashboard', { replace: true })
      return
    }
    if (org?.slug) {
      navigate(orgPath(org.slug, 'dashboard'), { replace: true })
      return
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="error-fallback company-page">
      <div className="error-fallback__panel">
        <h1 className="error-fallback__title">Something went wrong</h1>
        <p className="error-fallback__message">
          This page ran into a problem. You can try again or go back to the dashboard.
          Navigation and the sidebar should still work.
        </p>
        <div className="error-fallback__actions">
          <button type="button" className="company-btn company-btn--primary" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="company-btn company-btn--secondary" onClick={goHome}>
            Go to dashboard
          </button>
        </div>
        {import.meta.env.DEV && error && (
          <details className="error-fallback__details">
            <summary>Error details (development only)</summary>
            <pre className="error-fallback__stack">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
