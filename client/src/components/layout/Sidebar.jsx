import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { getNavItems, getShortcutOptions } from '../../config/navigation'
import { orgQuickAccessScope } from '../../hooks/useQuickAccess'
import { formatAccountRole } from '../../lib/accountRoles'
import { assetUrl } from '../../lib/assets'
import NavIcon from './NavIcon'
import SidebarUserFooter from './SidebarUserFooter'
import SidebarQuickAccess from './SidebarQuickAccess'
import './Sidebar.css'

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
  const { canRead, loading: permsLoading, accessRole, isOrgAdmin } = usePermissions()
  const location = useLocation()
  const navItems = org && !permsLoading ? getNavItems(org.slug, { canRead }) : []
  const quickAccessScope = org ? orgQuickAccessScope(org.id) : null
  const shortcutCatalog = useMemo(
    () => (org ? getShortcutOptions(org.slug) : []),
    [org?.slug],
  )
  const quickAccessOptions = useMemo(
    () => (org && !permsLoading ? getShortcutOptions(org.slug, { canRead }) : []),
    [org?.slug, canRead, permsLoading],
  )
  const [openMenu, setOpenMenu] = useState(null)

  useEffect(() => {
    if (!org || permsLoading) return
    const items = getNavItems(org.slug, { canRead })
    setOpenMenu(findActiveParentId(items, location.pathname))
  }, [location.pathname, org, canRead, permsLoading])

  const toggleMenu = (id) => {
    if (collapsed) return
    setOpenMenu((prev) => (prev === id ? null : id))
  }

  const roleLabel = accessRole?.name
    || (isOrgAdmin ? formatAccountRole(orgRole) || 'Admin' : null)
    || formatAccountRole(orgRole)
    || 'No role assigned'

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img src={assetUrl('Assets/images/logo.svg')} alt="MMS PRO" className="sidebar__logo" />
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
          <NavIcon name={collapsed ? 'sidebarExpand' : 'sidebarCollapse'} />
          {collapsed && (
            <span className="sidebar__tooltip" aria-hidden="true">Expand sidebar</span>
          )}
        </button>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => {
          if (item.children) {
            const isOpen = !collapsed && openMenu === item.id

            return (
              <div key={item.id} className="sidebar__group">
                <button
                  type="button"
                  className={`sidebar__link sidebar__link--parent`}
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
                        end
                        className={({ isActive }) =>
                          `sidebar__flyout-link ${isActive ? 'sidebar__flyout-link--active' : ''}`
                        }
                      >
                        {child.icon && <NavIcon name={child.icon} />}
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
                          end
                          className={({ isActive }) =>
                            `sidebar__sublink ${isActive ? 'sidebar__sublink--active' : ''}`
                          }
                        >
                          {child.icon && <NavIcon name={child.icon} />}
                          <span>{child.label}</span>
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
        {org && (
          <SidebarQuickAccess
            collapsed={collapsed}
            scope={quickAccessScope}
            options={quickAccessOptions}
            catalog={shortcutCatalog}
          />
        )}
        <SidebarUserFooter
          collapsed={collapsed}
          roleLabel={roleLabel}
          onSignOut={signOut}
        />
      </div>
    </aside>
  )
}
