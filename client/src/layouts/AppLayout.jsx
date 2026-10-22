import { useEffect, useState, Suspense, lazy } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { NotificationsProvider } from '../hooks/useNotifications'
import { ImportJobsProvider } from '../hooks/useImportJobs'
import ImportJobsBanner from '../components/shared/ImportJobsBanner'
import { useOrg } from '../hooks/useOrg'
import Sidebar from '../components/layout/Sidebar'
import MobileTopBar from '../components/layout/MobileTopBar'
import NotificationBell from '../components/layout/NotificationBell'
import useMobileNav from '../hooks/useMobileNav'
import { RouteErrorBoundary } from '../components/shared/ErrorBoundary'
import ErrorFallback from '../components/shared/ErrorFallback'
import { lookupEquipment } from '../lib/api-equipment'
import { parseEquipmentScan } from '../lib/equipmentQr'
import { orgPath } from '../config/navigation'
import './AppShell.css'

const EquipmentScanner = lazy(() => import('../components/equipment/EquipmentScanner'))

const STORAGE_KEY = 'sidebar-collapsed'

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { open: mobileNavOpen, setOpen: setMobileNavOpen } = useMobileNav()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanSession, setScanSession] = useState(0)
  const [scanNotice, setScanNotice] = useState(null)

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

  const openScanner = () => {
    setScanNotice(null)
    setScannerOpen(true)
  }

  const handleScan = async (text) => {
    const parsed = parseEquipmentScan(text)
    try {
      const row = parsed.equipmentId
        ? { id: parsed.equipmentId }
        : await lookupEquipment(text)
      if (!row?.id || !org?.slug) {
        throw new Error('This code is not an equipment record in your organization.')
      }
      setScannerOpen(false)
      setScanNotice(null)
      navigate(orgPath(org.slug, `scan/equipment/${row.id}`))
    } catch (err) {
      setScanNotice(err.message || 'This code is not an equipment record in your organization.')
      setScanSession((value) => value + 1)
      throw err
    }
  }

  return (
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
              <MobileTopBar
                onMenuClick={() => setMobileNavOpen(true)}
                menuOpen={mobileNavOpen}
                onScan={openScanner}
              />
              <NotificationBell />
              {scannerOpen && (
                <Suspense fallback={null}>
                  <EquipmentScanner
                    key={scanSession}
                    notice={scanNotice}
                    onClose={() => setScannerOpen(false)}
                    onResult={handleScan}
                  />
                </Suspense>
              )}
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
  )
}
