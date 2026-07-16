import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { OrgProvider } from './hooks/useOrg'
import { ProtectedRoute, OrgRoute, AdminRoute, ModuleRoute } from './components/shared/ProtectedRoute'
import { LegacyAppRedirect, RootRedirect } from './components/shared/OrgRedirect'
const AppLayout = lazy(() => import('./layouts/AppLayout'))
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Login = lazy(() => import('./pages/auth/Login'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazy(() => import('./pages/app/Dashboard'))
const Calendar = lazy(() => import('./pages/app/Calendar'))
const Company = lazy(() => import('./pages/app/Company'))
const Assets = lazy(() => import('./pages/app/Assets'))
const Equipment = lazy(() => import('./pages/app/Equipment'))
const WorkOrdersRouteLayout = lazy(() => import('./components/workorders/WorkOrdersRouteLayout'))
const ManualWorkOrders = lazy(() => import('./pages/app/ManualWorkOrders'))
const ManualWorkOrderCreate = lazy(() => import('./pages/app/ManualWorkOrderCreate'))
const ReceivedWorkOrders = lazy(() => import('./pages/app/ReceivedWorkOrders'))
const AssignedWorkOrders = lazy(() => import('./pages/app/AssignedWorkOrders'))
const ScheduledWorkOrders = lazy(() => import('./pages/app/ScheduledWorkOrders'))
const PlaceholderPage = lazy(() => import('./pages/app/PlaceholderPage'))
const RolesAccess = lazy(() => import('./pages/app/RolesAccess'))
const OrgHomeRedirect = lazy(() => import('./components/shared/OrgHomeRedirect'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const Organizations = lazy(() => import('./pages/admin/Organizations'))
const AdminOrgAssets = lazy(() => import('./pages/admin/AdminOrgAssets'))
const AdminOrgEquipment = lazy(() => import('./pages/admin/AdminOrgEquipment'))
const Users = lazy(() => import('./pages/admin/Users'))

const reportRouteModules = {
  'daily-logs': 'reports_daily_logs',
  'plant-wise': 'reports_plant_wise',
  'open-logs': 'reports_open_logs',
  'completed-logs': 'reports_completed_logs',
  overdue: 'reports_overdue',
}
const masterRoutes = ['order', 'activity']
const companyPageModules = ['company', 'locations', 'departments', 'employees']
const workOrderModules = [
  'work_orders',
  'work_orders_received',
  'work_orders_assigned',
  'work_orders_scheduled',
  'work_orders_manual',
]

export default function App() {
  const withSuspense = (element) => (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      {element}
    </Suspense>
  )

  const withModule = (moduleKeyOrKeys, element) => {
    const props = Array.isArray(moduleKeyOrKeys)
      ? { moduleKeys: moduleKeyOrKeys }
      : { moduleKey: moduleKeyOrKeys }
    return withSuspense(
      <ModuleRoute {...props}>{element}</ModuleRoute>,
    )
  }

  return (
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={withSuspense(<Login />)} />
            <Route path="/reset-password" element={withSuspense(<ResetPassword />)} />

            <Route path="/app/*" element={<ProtectedRoute><LegacyAppRedirect /></ProtectedRoute>} />

            <Route path="/admin" element={<AdminRoute>{withSuspense(<AdminLayout />)}</AdminRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={withSuspense(<AdminDashboard />)} />
              <Route path="organizations" element={withSuspense(<Organizations />)} />
              <Route path="organizations/:orgId/assets" element={withSuspense(<AdminOrgAssets />)} />
              <Route path="organizations/:orgId/equipment" element={withSuspense(<AdminOrgEquipment />)} />
              <Route path="users" element={withSuspense(<Users />)} />
            </Route>

            <Route path="/:orgSlug" element={<OrgRoute>{withSuspense(<AppLayout />)}</OrgRoute>}>
              <Route index element={withSuspense(<OrgHomeRedirect />)} />
              <Route path="dashboard" element={withModule('dashboard', <Dashboard />)} />
              <Route path="calendar" element={withModule('calendar', <Calendar />)} />
              <Route path="masters/company" element={withModule(companyPageModules, <Company />)} />
              <Route path="masters/assets" element={withModule('assets', <Assets />)} />
              <Route path="masters/equipment" element={withModule(['equipment', 'areas'], <Equipment />)} />
              <Route path="work-orders" element={withModule(workOrderModules, <WorkOrdersRouteLayout />)}>
                <Route path="received" element={withModule('work_orders_received', <ReceivedWorkOrders />)} />
                <Route path="assigned" element={withModule('work_orders_assigned', <AssignedWorkOrders />)} />
                <Route path="scheduled" element={withModule('work_orders_scheduled', <ScheduledWorkOrders />)} />
                <Route path="manual" element={withModule('work_orders_manual', <ManualWorkOrders />)} />
                <Route path="manual/create" element={withModule('work_orders_manual', <ManualWorkOrderCreate />)} />
              </Route>
              {Object.entries(reportRouteModules).map(([slug, moduleKey]) => (
                <Route
                  key={slug}
                  path={`reports/${slug}`}
                  element={withModule([moduleKey, 'reports'], <PlaceholderPage title={slug} />)}
                />
              ))}
              {masterRoutes.map((r) => (
                <Route
                  key={r}
                  path={`masters/${r}`}
                  element={withModule('company', <PlaceholderPage title={r} />)}
                />
              ))}
              <Route
                path="configuration/roles"
                element={withModule('roles_access', <RolesAccess />)}
              />
              <Route
                path="configuration/settings"
                element={withModule('settings', <PlaceholderPage title="settings" />)}
              />
            </Route>

            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  )
}
