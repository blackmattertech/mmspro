import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export const OrgRoute = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const { org, loading: orgLoading } = useOrg()
  const { orgSlug } = useParams()

  if (authLoading || orgLoading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!org) return <Navigate to="/onboard" replace />
  if (org.slug !== orgSlug) {
    return <Navigate to={`/${org.slug}/dashboard`} replace />
  }
  return children
}

export const AdminRoute = ({ children }) => {
  const { user, role, loading } = useAuth()
  const { org, loading: orgLoading } = useOrg()

  if (loading || orgLoading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (role !== 'admin') {
    const dest = org?.slug ? `/${org.slug}/dashboard` : '/onboard'
    return <Navigate to={dest} replace />
  }
  return children
}
