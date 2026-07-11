import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { NotificationsProvider } from '../hooks/useNotifications'
import { PermissionsProvider } from '../hooks/usePermissions'
import Sidebar from '../components/layout/Sidebar'
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
        <div className={`app-shell ${collapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} />
          <div className="app-shell__main">
            <Outlet />
          </div>
        </div>
      </NotificationsProvider>
    </PermissionsProvider>
  )
}
