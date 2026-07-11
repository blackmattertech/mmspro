import { Navigate, useParams } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'

/** Landing route: first module the user can read (admins get dashboard). */
export default function OrgHomeRedirect() {
  const { orgSlug } = useParams()
  const { loading, firstReadablePath, canRead } = usePermissions()

  if (loading) return <div className="loading">Loading...</div>
  if (!orgSlug) return <Navigate to="/login" replace />

  if (canRead('dashboard')) {
    return <Navigate to={`/${orgSlug}/dashboard`} replace />
  }

  return <Navigate to={firstReadablePath(orgSlug)} replace />
}
