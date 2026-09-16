import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ADMIN_NAV_ITEMS, getAdminShortcutOptions } from '../../config/adminNavigation'
import { ADMIN_QUICK_ACCESS_SCOPE } from '../../hooks/useQuickAccess'
import { assetUrl } from '../../lib/assets'
import NavIcon from '../layout/NavIcon'
import SidebarQuickAccess from '../layout/SidebarQuickAccess'
import SidebarUserFooter from '../layout/SidebarUserFooter'
import '../layout/Sidebar.css'
import './AdminSidebar.css'

export default function AdminSidebar({ collapsed = false, onToggle, mobileOpen = false, onMobileClose }) {
  const { signOut } = useAuth()
  const quickAccessOptions = useMemo(() => getAdminShortcutOptions(), [])
  const visualCollapsed = collapsed && !mobileOpen

  const handleNavClick = (event) => {
    if (event.target.closest('a[href]')) onMobileClose?.()
  }

  return (
    <aside
      id="app-sidebar"
      className={`sidebar admin-sidebar ${visualCollapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}
      onClick={handleNavClick}
    >
      <div className="sidebar__brand">
        <img src={assetUrl('Assets/images/logo.svg')} alt="MMS PRO" className="sidebar__logo" />
        {!visualCollapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">MMS PRO</span>
            <span className="sidebar__brand-tag">Admin Panel</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar__toggle sidebar__toggle--collapse"
          onClick={onToggle}
          aria-label={visualCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavIcon name={visualCollapsed ? 'sidebarExpand' : 'sidebarCollapse'} />
          {visualCollapsed && (
            <span className="sidebar__tooltip" aria-hidden="true">Expand sidebar</span>
          )}
        </button>
        {onMobileClose && (
          <button
            type="button"
            className="sidebar__toggle sidebar__toggle--close"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <NavIcon name="close" />
          </button>
        )}
      </div>

      <nav className="sidebar__nav">
        {ADMIN_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <NavIcon name={item.icon} />
            <span className="sidebar__link-label">{item.label}</span>
            {visualCollapsed && (
              <span className="sidebar__tooltip" aria-hidden="true">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <SidebarQuickAccess
          collapsed={visualCollapsed}
          scope={ADMIN_QUICK_ACCESS_SCOPE}
          options={quickAccessOptions}
        />
        <SidebarUserFooter
          collapsed={visualCollapsed}
          roleLabel="Super Admin"
          onSignOut={signOut}
        />
      </div>
    </aside>
  )
}
