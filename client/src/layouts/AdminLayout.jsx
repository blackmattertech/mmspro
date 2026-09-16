import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AdminSidebar from '../components/admin/AdminSidebar'
import MobileTopBar from '../components/layout/MobileTopBar'
import useMobileNav from '../hooks/useMobileNav'
import { RouteErrorBoundary } from '../components/shared/ErrorBoundary'
import ErrorFallback from '../components/shared/ErrorFallback'
import './AdminShell.css'

const STORAGE_KEY = 'admin-sidebar-collapsed'

export default function AdminLayout() {
  const location = useLocation()
  const { open: mobileNavOpen, setOpen: setMobileNavOpen } = useMobileNav()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // ignore storage errors
    }
  }, [collapsed])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname, setMobileNavOpen])

  return (
    <div className={`admin-shell ${collapsed ? 'admin-shell--sidebar-collapsed' : ''} ${mobileNavOpen ? 'admin-shell--mobile-nav-open' : ''}`}>
      <AdminSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      {mobileNavOpen && (
        <button
          type="button"
          className="admin-shell__nav-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <div className="admin-shell__main">
        <MobileTopBar title="MMS PRO Admin" onMenuClick={() => setMobileNavOpen(true)} menuOpen={mobileNavOpen} />
        <RouteErrorBoundary
          fallback={(error, reset) => (
            <ErrorFallback error={error} onRetry={reset} variant="admin" />
          )}
        >
          <Outlet key={location.pathname} />
        </RouteErrorBoundary>
      </div>
    </div>
  )
}
