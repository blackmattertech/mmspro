import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { NotificationsProvider } from '../hooks/useNotifications'
import { ImportJobsProvider } from '../hooks/useImportJobs'
import ImportJobsBanner from '../components/shared/ImportJobsBanner'
import { PermissionsProvider } from '../hooks/usePermissions'
import Sidebar from '../components/layout/Sidebar'
import { RouteErrorBoundary } from '../components/shared/ErrorBoundary'
import ErrorFallback from '../components/shared/ErrorFallback'
import './AppShell.css'

const STORAGE_KEY = 'sidebar-collapsed'

export default function AppLayout() {
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

  return (
    <PermissionsProvider>
      <NotificationsProvider>
        <ImportJobsProvider>
          <div className={`app-shell ${collapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} />
            <div className="app-shell__main">
              <ImportJobsBanner />
              <RouteErrorBoundary
                fallback={(error, reset) => (
                  <ErrorFallback error={error} onRetry={reset} variant="app" />
                )}
              >
                <Outlet />
              </RouteErrorBoundary>
            </div>
          </div>
        </ImportJobsProvider>
      </NotificationsProvider>
    </PermissionsProvider>
  )
}
