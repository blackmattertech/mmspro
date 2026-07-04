import { useOrg } from '../../hooks/useOrg'
import AssetsFieldsPanel from '../../components/assets/AssetsFieldsPanel'
import './Company.css'

export default function Assets() {
  const { orgRole, loading } = useOrg()
  const canManage = orgRole === 'owner' || orgRole === 'admin'

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
            You have read-only access. Contact an owner or admin to make changes.
          </p>
        )}

        <AssetsFieldsPanel canManage={canManage} />
      </div>
    </div>
  )
}
