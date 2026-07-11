import { usePermissions } from '../../hooks/usePermissions'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import './Company.css'

export default function Assets() {
  const { loading, canUpdate, canCreate, canDelete } = usePermissions()
  const canManage = canCreate('assets') || canUpdate('assets') || canDelete('assets')

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
          Define sections, parent fields, and child fields for asset forms and tickets
        </p>
      </header>

      <div className="company-page__content">
        {!canManage && (
          <p className="company-readonly-note">
            You have read-only access. Contact a company admin to make changes.
          </p>
        )}

        <AssetsFieldsPanel canManage={canManage} />
      </div>
    </div>
  )
}
