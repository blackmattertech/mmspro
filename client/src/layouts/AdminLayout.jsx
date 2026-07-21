import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import AdminSidebar from '../components/admin/AdminSidebar'
import { RouteErrorBoundary } from '../components/shared/ErrorBoundary'
import ErrorFallback from '../components/shared/ErrorFallback'
import './AdminShell.css'

const STORAGE_KEY = 'admin-sidebar-collapsed'

export default function AdminLayout() {
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
    <div className={`admin-shell ${collapsed ? 'admin-shell--sidebar-collapsed' : ''}`}>
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} />
      <div className="admin-shell__main">
        <RouteErrorBoundary
          fallback={(error, reset) => (
            <ErrorFallback error={error} onRetry={reset} variant="admin" />
          )}
        >
          <Outlet />
        </RouteErrorBoundary>
      </div>
    </div>
  )
}
