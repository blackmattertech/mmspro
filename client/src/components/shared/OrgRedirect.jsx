import { Navigate, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'

/** Redirects legacy /app/* URLs to /:orgSlug/* */
export function LegacyAppRedirect() {
  const { org, loading } = useOrg()
  const location = useLocation()

  if (loading) return <div className="loading">Loading...</div>
  if (!org) return <Navigate to="/onboard" replace />

  const suffix = location.pathname.replace(/^\/app\/?/, '') || 'dashboard'
  return <Navigate to={`/${org.slug}/${suffix}`} replace />
}

/** Sends authenticated users to their org dashboard, others to login */
export function RootRedirect() {
  const { org, loading } = useOrg()

  if (loading) return <div className="loading">Loading...</div>
  if (!org) return <Navigate to="/login" replace />
  return <Navigate to={`/${org.slug}/dashboard`} replace />
}
