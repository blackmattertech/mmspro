import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { getMastersHubItems } from '../../config/navigation'
import NavIcon from '../../components/layout/NavIcon'
import '../../components/company/CompanyShared.css'
import './Others.css'

export default function Masters() {
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canRead } = usePermissions()
  const cards = org?.slug
    ? getMastersHubItems(org.slug, { canRead, disabledModules: org.disabled_modules })
    : []

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Masters</h1>
        <p className="company-page__subtitle">
          Company records and form dropdowns used across modules.
        </p>
      </header>

      <div className="others-hub">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="others-hub__card"
            onClick={() => navigate(card.path)}
          >
            <span className="others-hub__icon" aria-hidden="true">
              <NavIcon name={card.icon} />
            </span>
            <span className="others-hub__body">
              <span className="others-hub__title">{card.title || card.label}</span>
              <span className="others-hub__desc">{card.description}</span>
            </span>
            <span className="others-hub__chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
