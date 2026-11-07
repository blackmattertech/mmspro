import { usePermissions } from '../../hooks/usePermissions'
import WorkCentersTab from '../../components/company/WorkCentersTab'
import MastersBack from '../../components/company/MastersBack'
import './Company.css'

export default function WorkCenters() {
  const { loading, canRead, canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = canCreate('work_centers') || canUpdate('work_centers') || canDelete('work_centers')

  if (loading) {
    return (
      <div className="company-page company-page--fill">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  if (!canRead('work_centers')) {
    return (
      <div className="company-page">
        <div className="company-empty">You do not have permission to view work centers.</div>
      </div>
    )
  }

  return (
    <div className="company-page company-page--fill">
      <header className="company-page__header">
        <MastersBack />
        <h1 className="company-page__title">Work Center</h1>
        <p className="company-page__subtitle">
          Manage workshops, plants, and crews used across work orders and PM.
        </p>
      </header>

      <div className="company-page__content">
        <WorkCentersTab canManage={canManage} />
      </div>
    </div>
  )
}
