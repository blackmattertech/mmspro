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
          Manage dropdown child values for your organization&apos;s asset forms
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
            You can add and edit option values here.
          </p>
        )}

        <AssetsFieldsPanel
          canManageSchema={canManageSchema}
          canManageChildren={canManageChildren}
        />
      </div>
    </div>
  )
}
