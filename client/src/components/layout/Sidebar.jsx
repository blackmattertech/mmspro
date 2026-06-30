import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { getNavItems } from '../../config/navigation'
import NavIcon from './NavIcon'
import './Sidebar.css'

const formatRole = (role) => {
  const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' }
  return labels[role] ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member')
}

export default function Sidebar({ collapsed = false, onToggle }) {
  const { user, signOut } = useAuth()
  const { org, orgRole } = useOrg()
  const location = useLocation()
  const [openMenus, setOpenMenus] = useState(['work-orders', 'reports'])

  const navItems = org ? getNavItems(org.slug) : []

  const toggleMenu = (id) => {
    if (collapsed) return
    setOpenMenus((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  const companyName = org?.name ?? 'Company'
  const roleLabel = formatRole(orgRole)
  const avatarLetter = (companyName[0] || user?.email?.[0] || 'U').toUpperCase()

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
            const isOpen = !collapsed && openMenus.includes(item.id)
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
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {avatarLetter}
            {collapsed && (
              <span className="sidebar__tooltip" aria-hidden="true">{companyName}</span>
            )}
          </div>
          {!collapsed && (
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{companyName}</span>
              <span className="sidebar__user-role">{roleLabel}</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar__logout-btn"
            onClick={signOut}
            aria-label="Sign out"
          >
            <NavIcon name="logout" />
            {collapsed && (
              <span className="sidebar__tooltip" aria-hidden="true">Sign out</span>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
