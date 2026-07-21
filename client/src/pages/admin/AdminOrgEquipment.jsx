import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrganization } from '../../lib/api'
import { useAdminEquipmentFields } from '../../hooks/useAdminEquipmentFields'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import '../app/Company.css'
import './AdminPage.css'
import './AdminOrgAssets.css'

export default function AdminOrgEquipment() {
  const { orgId } = useParams()
  const [org, setOrg] = useState(null)
  const [orgError, setOrgError] = useState(null)
  const fieldsState = useAdminEquipmentFields(orgId)

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
            {org ? `${org.name} — Equipment Fields` : 'Equipment Fields'}
          </h1>
          <p className="admin-page__subtitle">
            Define parent fields and option values for this organization&apos;s equipment records.
            Sections are shared with Assets.
          </p>
        </div>
      </header>

      <div className="admin-page__content">
        {orgError && <div className="admin-alert">{orgError}</div>}
        {org && (
          <p className="company-readonly-note">
            Managing equipment schema for <strong>{org.name}</strong> (/{org.slug})
          </p>
        )}

        <AssetsFieldsPanel
          orgId={orgId}
          fieldsState={fieldsState}
          canManageSchema
          canManageChildren
          fieldScope="equipment"
        />
      </div>
    </div>
  )
}
