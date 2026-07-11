import { Navigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { isSuperAdmin } from '../../lib/accountRoles'
import { moduleKeyForPath } from '../../config/navigation'

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
  if (!org) return <Navigate to="/login" replace state={{ error: 'No organization is linked to your account. Contact your administrator.' }} />
  if (org.is_active === false) {
    return <Navigate to="/login" replace state={{ error: 'Your organization has been disabled. Contact support.' }} />
  }
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
  if (!isSuperAdmin(role)) {
    const dest = org?.slug ? `/${org.slug}/dashboard` : '/login'
    return <Navigate to={dest} replace />
  }
  return children
}

/** Require can_read for the module matching the current path (or explicit moduleKey / moduleKeys). */
export const ModuleRoute = ({ moduleKey, moduleKeys, children }) => {
  const { org } = useOrg()
  const location = useLocation()
  const { loading, canRead, firstReadablePath } = usePermissions()

  if (loading) return <div className="loading">Loading...</div>

  const keys = moduleKeys?.length
    ? moduleKeys
    : [moduleKey || moduleKeyForPath(location.pathname, org?.slug)].filter(Boolean)

  if (keys.length && !keys.some((key) => canRead(key))) {
    const fallback = org?.slug ? firstReadablePath(org.slug) : '/login'
    return <Navigate to={fallback} replace />
  }

  return children
}
