import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrganization } from '../../lib/api'
import PageBack from '../../components/shared/PageBack'
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
            <PageBack to="/admin/organizations" label="Organizations" />
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
