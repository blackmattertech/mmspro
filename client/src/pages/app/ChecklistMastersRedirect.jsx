import { Navigate, useParams } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'

/** Old Masters → Others → Checklists bookmarks land on Masters → Checklists. */
export default function ChecklistMastersRedirect() {
  const { checklistId } = useParams()
  const { org } = useOrg()
  if (!org?.slug) return <div className="company-loading">Loading…</div>
  if (checklistId) {
    return (
      <Navigate
        to={orgPath(org.slug, `masters/checklists/${encodeURIComponent(checklistId)}`)}
        replace
      />
    )
  }
  return <Navigate to={orgPath(org.slug, 'masters/checklists')} replace />
}
