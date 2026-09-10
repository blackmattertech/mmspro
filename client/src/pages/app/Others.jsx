import { useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import NavIcon from '../../components/layout/NavIcon'
import '../../components/company/CompanyShared.css'
import './Others.css'

const HUB_CARDS = [
  {
    id: 'status',
    title: 'Status',
    description: 'Create and manage statuses for work requests, work orders, tasks, and more.',
    icon: 'list',
    segment: 'masters/others/status',
  },
  {
    id: 'checklists',
    title: 'Checklists',
    description: 'Build reusable checklists with sections and typed inspection fields.',
    icon: 'clipboard',
    segment: 'masters/others/checklists',
  },
]

export default function Others() {
  const navigate = useNavigate()
  const { org } = useOrg()

  return (
    <div className="company-page others-page">
      <header className="company-page__header">
        <h1 className="company-page__title">Others</h1>
        <p className="company-page__subtitle">
          Shared masters used across requests, orders, and related modules.
        </p>
      </header>

      <div className="others-hub">
        {HUB_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            className="others-hub__card"
            onClick={() => org?.slug && navigate(orgPath(org.slug, card.segment))}
          >
            <span className="others-hub__icon" aria-hidden="true">
              <NavIcon name={card.icon} />
            </span>
            <span className="others-hub__body">
              <span className="others-hub__title">{card.title}</span>
              <span className="others-hub__desc">{card.description}</span>
            </span>
            <span className="others-hub__chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
