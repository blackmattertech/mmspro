import { Navigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'

/** Old Masters → Others → Status bookmarks land on Forms Master. */
export default function FormMasterStatusRedirect() {
  const { entityType } = useParams()
  const { org } = useOrg()
  if (!org?.slug) return <div className="company-loading">Loading…</div>
  if (entityType) {
    return (
      <Navigate
        to={orgPath(org.slug, `masters/forms/status/${encodeURIComponent(entityType)}`)}
        replace
      />
    )
  }
  return <Navigate to={orgPath(org.slug, 'masters/forms')} replace />
}
