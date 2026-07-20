import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrganization } from '../../lib/api'
import { useAdminAssetFields } from '../../hooks/useAdminAssetFields'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import '../app/Company.css'
import './AdminPage.css'
import './AdminOrgAssets.css'

export default function AdminOrgAssets() {
  const { orgId } = useParams()
  const [org, setOrg] = useState(null)
  const [orgError, setOrgError] = useState(null)
  const fieldsState = useAdminAssetFields(orgId)

  useEffect(() => {
    if (!orgId) return
    setOrgError(null)
    getOrganization(orgId)
      .then(setOrg)
      .catch((err) => setOrgError(err.message))
  }, [orgId])

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <p className="admin-page__subtitle">
            <Link to="/admin/organizations" className="admin-org-assets__back">
              ← Organizations
            </Link>
          </p>
          <h1 className="admin-page__title">
            {org ? `${org.name} — Assets` : 'Organization Assets'}
          </h1>
          <p className="admin-page__subtitle">
            Define sections, parent fields, and dropdown child values for this organization.
          </p>
        </div>
      </header>

      <div className="admin-page__content">
        {orgError && <div className="admin-alert">{orgError}</div>}
        {org && (
          <p className="company-readonly-note">
            Managing asset schema for <strong>{org.name}</strong> (/{org.slug})
          </p>
        )}

        <AssetsFieldsPanel
          orgId={orgId}
          fieldsState={fieldsState}
          canManageSchema
          canManageChildren
        />
      </div>
    </div>
  )
}
