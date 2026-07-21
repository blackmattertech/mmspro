import { usePermissions } from '../../hooks/usePermissions'
import { isCompanyAdmin } from '../../lib/accountRoles'
import { useAuth } from '../../hooks/useAuth'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import './Company.css'

export default function Assets() {
  const { role } = useAuth()
  const { loading, canUpdate } = usePermissions()
  const canManageSchema = false
  const canManageChildren = isCompanyAdmin(role) || canUpdate('assets')
  const canManage = canManageChildren

  if (loading) {
    return (
      <div className="company-page">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="company-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Assets</h1>
        <p className="company-page__subtitle">
          Manage dropdown option values for work order and other asset forms. Equipment field options are under Equipment.
        </p>
      </header>

      <div className="company-page__content">
        {!canManage && (
          <p className="company-readonly-note">
            You have read-only access. Contact a company admin to make changes.
          </p>
        )}
        {canManage && (
          <p className="company-readonly-note">
            Sections and parent fields are configured by Super Admin per organization.
            You can add and edit option values here. For equipment master fields (e.g. Equipment Details), use Equipment → Field options.
          </p>
        )}

        <AssetsFieldsPanel
          canManageSchema={canManageSchema}
          canManageChildren={canManageChildren}
          fieldScope="assets"
        />
      </div>
    </div>
  )
}
