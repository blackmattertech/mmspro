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
        <h1 className="company-page__title">Fields</h1>
        <p className="company-page__subtitle">
          Manage dropdown option values for work order and other asset forms. Equipment field options are under Equipment.
        </p>
      </header>

      <div className="company-page__content">
        <AssetsFieldsPanel
          canManageSchema={canManageSchema}
          canManageChildren={canManageChildren}
          fieldScope="assets"
        />
      </div>
    </div>
  )
}
