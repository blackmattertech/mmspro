import { useLocation } from 'react-router-dom'
import './PlaceholderPage.css'

export default function PlaceholderPage({ title }) {
  const location = useLocation()
  const pageTitle = title || location.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Page'

  return (
    <div className="placeholder-page">
      <h1 className="placeholder-page__title">
        {pageTitle.charAt(0).toUpperCase() + pageTitle.slice(1)}
      </h1>
      <p className="placeholder-page__text">This section is coming soon.</p>
    </div>
  )
}
