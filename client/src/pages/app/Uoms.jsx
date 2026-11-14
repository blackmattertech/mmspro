import { usePermissions } from '../../hooks/usePermissions'
import UomsTab from '../../components/company/UomsTab'
import MastersBack from '../../components/company/MastersBack'
import './Company.css'

export default function Uoms() {
  const { loading, canRead, canCreate, canUpdate, canDelete } = usePermissions()
  const canManage = canCreate('uoms') || canUpdate('uoms') || canDelete('uoms')

  if (loading) {
    return (
      <div className="company-page company-page--fill">
        <div className="company-loading">Loading...</div>
      </div>
    )
  }

  if (!canRead('uoms')) {
    return (
      <div className="company-page">
        <div className="company-empty">You do not have permission to view units of measure.</div>
      </div>
    )
  }

  return (
    <div className="company-page company-page--fill">
      <header className="company-page__header">
        <MastersBack />
        <h1 className="company-page__title">UOM</h1>
        <p className="company-page__subtitle">
          Add the units this company uses. Active units are the only choices wherever a quantity needs a UOM.
        </p>
      </header>

      <div className="company-page__content">
        <UomsTab canManage={canManage} />
      </div>
    </div>
  )
}
