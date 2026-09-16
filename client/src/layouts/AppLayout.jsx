import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NotificationsProvider } from '../hooks/useNotifications'
import { ImportJobsProvider } from '../hooks/useImportJobs'
import ImportJobsBanner from '../components/shared/ImportJobsBanner'
import { PermissionsProvider } from '../hooks/usePermissions'
import Sidebar from '../components/layout/Sidebar'
import MobileTopBar from '../components/layout/MobileTopBar'
import NotificationBell from '../components/layout/NotificationBell'
import useMobileNav from '../hooks/useMobileNav'
import { RouteErrorBoundary } from '../components/shared/ErrorBoundary'
import ErrorFallback from '../components/shared/ErrorFallback'
import './AppShell.css'

const STORAGE_KEY = 'sidebar-collapsed'

export default function AppLayout() {
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
    <PermissionsProvider>
      <NotificationsProvider>
        <ImportJobsProvider>
          <div className={`app-shell ${collapsed ? 'app-shell--sidebar-collapsed' : ''} ${mobileNavOpen ? 'app-shell--mobile-nav-open' : ''}`}>
            <Sidebar
              collapsed={collapsed}
              onToggle={() => setCollapsed((prev) => !prev)}
              mobileOpen={mobileNavOpen}
              onMobileClose={() => setMobileNavOpen(false)}
            />
            {mobileNavOpen && (
              <button
                type="button"
                className="app-shell__nav-overlay"
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
              />
            )}
            <div className="app-shell__main">
              <MobileTopBar onMenuClick={() => setMobileNavOpen(true)} menuOpen={mobileNavOpen} />
              <NotificationBell />
              <ImportJobsBanner />
              <RouteErrorBoundary
                fallback={(error, reset) => (
                  <ErrorFallback error={error} onRetry={reset} variant="app" />
                )}
              >
                <Outlet key={location.pathname} />
              </RouteErrorBoundary>
            </div>
          </div>
        </ImportJobsProvider>
      </NotificationsProvider>
    </PermissionsProvider>
  )
}
