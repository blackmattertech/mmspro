import { Link, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { getBreadcrumbsForPath } from '../../config/navigation'
import './PageBreadcrumbs.css'

export default function PageBreadcrumbs({ items, className = '' }) {
  const location = useLocation()
  const { org } = useOrg()
  const crumbs = items ?? getBreadcrumbsForPath(location.pathname, org?.slug)

  if (crumbs.length < 2) return null

  return (
    <nav className={`page-breadcrumbs ${className}`.trim()} aria-label="Breadcrumb">
      <ol className="page-breadcrumbs__list">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="page-breadcrumbs__item">
              {index > 0 && (
                <span className="page-breadcrumbs__sep" aria-hidden="true">/</span>
              )}
              {isLast || !crumb.to ? (
                <span className="page-breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className="page-breadcrumbs__link">
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
