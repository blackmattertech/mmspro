import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { ADMIN_NAV_ITEMS, getAdminShortcutOptions } from '../../config/adminNavigation'
import { ADMIN_QUICK_ACCESS_SCOPE } from '../../hooks/useQuickAccess'
import NavIcon from '../layout/NavIcon'
import SidebarQuickAccess from '../layout/SidebarQuickAccess'
import SidebarUserFooter from '../layout/SidebarUserFooter'
import '../layout/Sidebar.css'
import './AdminSidebar.css'

export default function AdminSidebar({ collapsed = false, onToggle }) {
  const { signOut } = useAuth()
  const quickAccessOptions = useMemo(() => getAdminShortcutOptions(), [])

  return (
    <aside className={`sidebar admin-sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img src="/Assets/images/logo.svg" alt="MMS PRO" className="sidebar__logo" />
        {!collapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">MMS PRO</span>
            <span className="sidebar__brand-tag">Admin Panel</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavIcon name={collapsed ? 'sidebarExpand' : 'sidebarCollapse'} />
          {collapsed && (
            <span className="sidebar__tooltip" aria-hidden="true">Expand sidebar</span>
          )}
        </button>
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
            {collapsed && (
              <span className="sidebar__tooltip" aria-hidden="true">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <SidebarQuickAccess
          collapsed={collapsed}
          scope={ADMIN_QUICK_ACCESS_SCOPE}
          options={quickAccessOptions}
        />
        <SidebarUserFooter
          collapsed={collapsed}
          roleLabel="Super Admin"
          onSignOut={signOut}
        />
      </div>
    </aside>
  )
}
