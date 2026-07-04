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
import Assets from './pages/app/Assets'
import WorkOrdersRouteLayout from './components/workorders/WorkOrdersRouteLayout'
import ManualWorkOrders from './pages/app/ManualWorkOrders'
import ManualWorkOrderCreate from './pages/app/ManualWorkOrderCreate'
import ReceivedWorkOrders from './pages/app/ReceivedWorkOrders'
import AssignedWorkOrders from './pages/app/AssignedWorkOrders'
import ScheduledWorkOrders from './pages/app/ScheduledWorkOrders'
import PlaceholderPage from './pages/app/PlaceholderPage'
import AdminDashboard from './pages/admin/Dashboard'
import Organizations from './pages/admin/Organizations'
import Users from './pages/admin/Users'

const reportRoutes = ['daily-logs', 'plant-wise', 'open-logs', 'completed-logs', 'overdue']
const masterRoutes = ['order', 'activity']
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
            <Route path="masters/assets" element={<Assets />} />
            <Route path="work-orders" element={<WorkOrdersRouteLayout />}>
              <Route path="received" element={<ReceivedWorkOrders />} />
              <Route path="assigned" element={<AssignedWorkOrders />} />
              <Route path="scheduled" element={<ScheduledWorkOrders />} />
              <Route path="manual" element={<ManualWorkOrders />} />
              <Route path="manual/create" element={<ManualWorkOrderCreate />} />
            </Route>
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
