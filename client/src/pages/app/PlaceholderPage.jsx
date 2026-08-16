import { useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import PageBack from '../../components/shared/PageBack'
import './PlaceholderPage.css'

export default function PlaceholderPage({ title }) {
  const location = useLocation()
  const { org } = useOrg()
  const pageTitle = title || location.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Page'

  return (
    <div className="placeholder-page">
      <PageBack
        to={org?.slug ? orgPath(org.slug, 'dashboard') : '#'}
        label="Dashboard"
      />
      <h1 className="placeholder-page__title">
        {pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1)}
      </h1>
      <p className="placeholder-page__text">This section is coming soon.</p>
    </div>
  )
}
