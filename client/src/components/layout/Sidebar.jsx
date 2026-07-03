import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { getNavItems } from '../../config/navigation'
import NavIcon from './NavIcon'
import SidebarUserFooter from './SidebarUserFooter'
import './Sidebar.css'

const formatRole = (role) => {
  const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' }
  return labels[role] ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member')
}

function findActiveParentId(navItems, pathname) {
  for (const item of navItems) {
    if (item.children?.some((child) => pathname === child.path || pathname.startsWith(`${child.path}/`))) {
      return item.id
    }
  }
  return null
}

export default function Sidebar({ collapsed = false, onToggle }) {
  const { signOut } = useAuth()
  const { org, orgRole } = useOrg()
  const location = useLocation()
  const navItems = org ? getNavItems(org.slug) : []
  const [openMenu, setOpenMenu] = useState(null)

  useEffect(() => {
    if (!org) return
    const items = getNavItems(org.slug)
    setOpenMenu(findActiveParentId(items, location.pathname))
  }, [location.pathname, org])

  const toggleMenu = (id) => {
    if (collapsed) return
    setOpenMenu((prev) => (prev === id ? null : id))
  }

  const roleLabel = formatRole(orgRole)

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img src="/Assets/images/logo.svg" alt="MMS PRO" className="sidebar__logo" />
        {!collapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">MMS PRO</span>
            <span className="sidebar__brand-tag">Maintenance Solution</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavIcon name={collapsed ? 'panelOpen' : 'panelClose'} />
          {collapsed && (
            <span className="sidebar__tooltip" aria-hidden="true">Expand sidebar</span>
          )}
        </button>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => {
          if (item.children) {
            const isOpen = !collapsed && openMenu === item.id
            const isChildActive = item.children.some((c) => location.pathname === c.path)

            return (
              <div key={item.id} className="sidebar__group">
                <button
                  type="button"
                  className={`sidebar__link sidebar__link--parent ${isChildActive ? 'sidebar__link--active' : ''}`}
                  onClick={() => toggleMenu(item.id)}
                >
                  <NavIcon name={item.icon} />
                  <span className="sidebar__link-label">{item.label}</span>
                  {collapsed && (
                    <span className="sidebar__tooltip" aria-hidden="true">{item.label}</span>
                  )}
                  {!collapsed && (
                    <span className={`sidebar__chevron ${isOpen ? 'sidebar__chevron--open' : ''}`}>
                      <NavIcon name="chevron" />
                    </span>
                  )}
                </button>
                {collapsed ? (
                  <div className="sidebar__flyout">
                    <span className="sidebar__flyout-title">{item.label}</span>
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          `sidebar__flyout-link ${isActive ? 'sidebar__flyout-link--active' : ''}`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : (
                  isOpen && (
                    <div className="sidebar__children">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={({ isActive }) =>
                            `sidebar__sublink ${isActive ? 'sidebar__sublink--active' : ''}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          }

          return (
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
          )
        })}
      </nav>

      <div className="sidebar__footer">
        <SidebarUserFooter
          collapsed={collapsed}
          roleLabel={roleLabel}
          onSignOut={signOut}
        />
      </div>
    </aside>
  )
}
