import { lazy, Suspense } from 'react'
import { WORK_REQUEST_MODULE_KEYS } from './lib/accessModules'
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
const BlankPage = lazy(() => import('./pages/app/BlankPage'))
const TasksRouteLayout = lazy(() => import('./components/tasks/TasksRouteLayout'))
const TasksManager = lazy(() => import('./pages/app/TasksManager'))
const TaskDetailPage = lazy(() => import('./pages/app/TaskDetailPage'))
const TaskFormPage = lazy(() => import('./pages/app/TaskFormPage'))
const WarrantyManager = lazy(() => import('./pages/app/WarrantyManager'))
const WarrantyDetailPage = lazy(() => import('./pages/app/WarrantyDetailPage'))
const WarrantyFormPage = lazy(() => import('./pages/app/WarrantyFormPage'))
const Vendors = lazy(() => import('./pages/app/Vendors'))
const VendorDetailPage = lazy(() => import('./pages/app/VendorDetailPage'))
const ConfigurationImport = lazy(() => import('./pages/app/ConfigurationImport'))
const WorkRequestCreate = lazy(() => import('./pages/app/WorkRequestCreate'))
const WorkRequestListPage = lazy(() => import('./pages/app/WorkRequestListPage'))
const WorkRequestsRouteLayout = lazy(() => import('./components/workrequests/WorkRequestsRouteLayout'))
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
              <Route
                path="work-request"
                element={withModule([...WORK_REQUEST_MODULE_KEYS, 'work_request'], <WorkRequestsRouteLayout />)}
              >
                <Route
                  path="create"
                  element={withModule(['work_request_create', 'work_request'], <WorkRequestCreate />)}
                />
                <Route
                  path="my"
                  element={withModule(['work_request_my', 'work_request'], (
                    <WorkRequestListPage
                      filter="my"
                      emptyHint="Work requests you submitted appear here."
                    />
                  ))}
                />
                <Route
                  path="incoming"
                  element={withModule(['work_request_incoming', 'work_request'], (
                    <WorkRequestListPage
                      filter="incoming"
                      emptyHint="Requests routed to your department appear here."
                    />
                  ))}
                />
                <Route
                  path="outgoing"
                  element={withModule(['work_request_outgoing', 'work_request'], (
                    <WorkRequestListPage
                      filter="outgoing"
                      emptyHint="Requests your department sent to others appear here."
                    />
                  ))}
                />
                <Route
                  path="all"
                  element={withModule(['work_request_all', 'work_request'], (
                    <WorkRequestListPage
                      filter="all"
                      emptyHint="No work requests in this organization yet."
                    />
                  ))}
                />
              </Route>
              <Route path="calendar" element={withModule('calendar', <Calendar />)} />
              <Route path="warranty-manager" element={withModule('warranty_manager', <WarrantyManager />)} />
              <Route path="warranty-manager/create" element={withModule('warranty_manager', <WarrantyFormPage />)} />
              <Route path="warranty-manager/:warrantyId/edit" element={withModule('warranty_manager', <WarrantyFormPage />)} />
              <Route path="warranty-manager/:warrantyId" element={withModule('warranty_manager', <WarrantyDetailPage />)} />
              <Route path="tasks-and-followups" element={withModule('tasks_followups', <TasksRouteLayout />)}>
                <Route index element={withModule('tasks_followups', <TasksManager />)} />
                <Route path="create" element={withModule('tasks_followups', <TaskFormPage />)} />
                <Route path=":taskId/edit" element={withModule('tasks_followups', <TaskFormPage />)} />
                <Route path=":taskId" element={withModule('tasks_followups', <TaskDetailPage />)} />
              </Route>
              <Route path="masters/company" element={withModule(companyPageModules, <Company />)} />
              <Route path="masters/assets" element={withModule('assets', <Assets />)} />
              <Route path="masters/equipment" element={withModule(['equipment', 'areas'], <Equipment />)} />
              <Route path="masters/vendors" element={withSuspense(<Vendors />)} />
              <Route path="masters/vendors/:vendorId" element={withSuspense(<VendorDetailPage />)} />
              <Route path="work-orders" element={withModule(workOrderModules, <WorkOrdersRouteLayout />)}>
                <Route path="received" element={withModule('work_orders_received', <ReceivedWorkOrders />)} />
                <Route path="assigned" element={withModule('work_orders_assigned', <AssignedWorkOrders />)} />
                <Route path="scheduled" element={withModule('work_orders_scheduled', <ScheduledWorkOrders />)} />
                <Route path="manual" element={withModule('work_orders_manual', <ManualWorkOrders />)} />
                <Route path="manual/create" element={withModule('work_orders_manual', <ManualWorkOrderCreate />)} />
                <Route path="manual/:workOrderId/edit" element={withModule('work_orders_manual', <ManualWorkOrderCreate />)} />
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
              <Route
                path="configuration/import"
                element={withSuspense(<ConfigurationImport />)}
              />
              <Route
                path="configuration/export"
                element={withModule('settings', <PlaceholderPage title="Export" />)}
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
