import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute, OrgRoute, AdminRoute } from './components/shared/ProtectedRoute'
import { LegacyAppRedirect, RootRedirect } from './components/shared/OrgRedirect'
import AppLayout from './layouts/AppLayout'
import AdminLayout from './layouts/AdminLayout'
import Login from './pages/auth/Login'
import ResetPassword from './pages/auth/ResetPassword'
import Onboard from './pages/auth/Onboard'
import Dashboard from './pages/app/Dashboard'
import Calendar from './pages/app/Calendar'
import Company from './pages/app/Company'
import PlaceholderPage from './pages/app/PlaceholderPage'
import AdminDashboard from './pages/admin/Dashboard'
import Organizations from './pages/admin/Organizations'
import Users from './pages/admin/Users'

const workOrderRoutes = ['received', 'assigned', 'scheduled', 'manual']
const reportRoutes = ['daily-logs', 'plant-wise', 'open-logs', 'completed-logs', 'overdue']
const masterRoutes = ['assets', 'order', 'activity']
const configRoutes = ['employees', 'roles', 'permission', 'settings']

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboard" element={<ProtectedRoute><Onboard /></ProtectedRoute>} />

          <Route path="/app/*" element={<ProtectedRoute><LegacyAppRedirect /></ProtectedRoute>} />

          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="users" element={<Users />} />
          </Route>

          <Route path="/:orgSlug" element={<OrgRoute><AppLayout /></OrgRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="masters/company" element={<Company />} />
            {workOrderRoutes.map((r) => (
              <Route key={r} path={`work-orders/${r}`} element={<PlaceholderPage title={r} />} />
            ))}
            {reportRoutes.map((r) => (
              <Route key={r} path={`reports/${r}`} element={<PlaceholderPage title={r} />} />
            ))}
            {masterRoutes.map((r) => (
              <Route key={r} path={`masters/${r}`} element={<PlaceholderPage title={r} />} />
            ))}
            {configRoutes.map((r) => (
              <Route key={r} path={`configuration/${r}`} element={<PlaceholderPage title={r} />} />
            ))}
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
