import { Suspense } from 'react'
import { WORK_REQUEST_MODULE_KEYS, REPORT_MODULE_KEYS } from './lib/accessModules'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazyPage } from './lib/lazyPage'
import { AuthProvider } from './hooks/useAuth'
import { OrgProvider } from './hooks/useOrg'
import { ProtectedRoute, OrgRoute, AdminRoute, ModuleRoute } from './components/shared/ProtectedRoute'
import { LegacyAppRedirect, RootRedirect } from './components/shared/OrgRedirect'
const AppLayout = lazyPage(() => import('./layouts/AppLayout'))
const AdminLayout = lazyPage(() => import('./layouts/AdminLayout'))
const Login = lazyPage(() => import('./pages/auth/Login'))
const ResetPassword = lazyPage(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazyPage(() => import('./pages/app/Dashboard'))
const Calendar = lazyPage(() => import('./pages/app/Calendar'))
const Company = lazyPage(() => import('./pages/app/Company'))
const Assets = lazyPage(() => import('./pages/app/Assets'))
const Equipment = lazyPage(() => import('./pages/app/Equipment'))
const WorkOrdersRouteLayout = lazyPage(() => import('./components/workorders/WorkOrdersRouteLayout'))
const PmScheduledRouteLayout = lazyPage(() => import('./components/workorders/PmScheduledRouteLayout'))
const ManualWorkOrders = lazyPage(() => import('./pages/app/ManualWorkOrders'))
const ManualWorkOrderCreate = lazyPage(() => import('./pages/app/ManualWorkOrderCreate'))
const ReceivedWorkOrders = lazyPage(() => import('./pages/app/ReceivedWorkOrders'))
const AssignedWorkOrders = lazyPage(() => import('./pages/app/AssignedWorkOrders'))
const ScheduledWorkOrders = lazyPage(() => import('./pages/app/ScheduledWorkOrders'))
const PlaceholderPage = lazyPage(() => import('./pages/app/PlaceholderPage'))
const ReportPage = lazyPage(() => import('./pages/app/reports/ReportPage'))
const TasksRouteLayout = lazyPage(() => import('./components/tasks/TasksRouteLayout'))
const TasksManager = lazyPage(() => import('./pages/app/TasksManager'))
const TaskDetailPage = lazyPage(() => import('./pages/app/TaskDetailPage'))
const TaskFormPage = lazyPage(() => import('./pages/app/TaskFormPage'))
const WarrantyManager = lazyPage(() => import('./pages/app/WarrantyManager'))
const WarrantyDetailPage = lazyPage(() => import('./pages/app/WarrantyDetailPage'))
const WarrantyFormPage = lazyPage(() => import('./pages/app/WarrantyFormPage'))
const Vendors = lazyPage(() => import('./pages/app/Vendors'))
const VendorDetailPage = lazyPage(() => import('./pages/app/VendorDetailPage'))
const Others = lazyPage(() => import('./pages/app/Others'))
const OthersStatusTypes = lazyPage(() => import('./pages/app/OthersStatusTypes'))
const OthersStatusManage = lazyPage(() => import('./pages/app/OthersStatusManage'))
const OthersChecklists = lazyPage(() => import('./pages/app/OthersChecklists'))
const OthersChecklistBuilder = lazyPage(() => import('./pages/app/OthersChecklistBuilder'))
const OthersCharacterLimits = lazyPage(() => import('./pages/app/OthersCharacterLimits'))
const ConfigurationImport = lazyPage(() => import('./pages/app/ConfigurationImport'))
const WorkRequestCreate = lazyPage(() => import('./pages/app/WorkRequestCreate'))
const WorkRequestListPage = lazyPage(() => import('./pages/app/WorkRequestListPage'))
const WorkRequestsRouteLayout = lazyPage(() => import('./components/workrequests/WorkRequestsRouteLayout'))
const RolesAccess = lazyPage(() => import('./pages/app/RolesAccess'))
const OrgHomeRedirect = lazyPage(() => import('./components/shared/OrgHomeRedirect'))
const AdminDashboard = lazyPage(() => import('./pages/admin/Dashboard'))
const Organizations = lazyPage(() => import('./pages/admin/Organizations'))
const AdminOrgAssets = lazyPage(() => import('./pages/admin/AdminOrgAssets'))
const AdminOrgEquipment = lazyPage(() => import('./pages/admin/AdminOrgEquipment'))
const Users = lazyPage(() => import('./pages/admin/Users'))

const masterRoutes = ['order', 'activity']
const companyPageModules = ['company', 'locations', 'departments', 'work_centers', 'employees']
const workOrderModules = [
  'work_orders',
  'work_orders_received',
  'work_orders_assigned',
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
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
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
                <Route index element={<Navigate to="create" replace />} />
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
              <Route path="masters/others" element={withSuspense(<Others />)} />
              <Route path="masters/others/status" element={withSuspense(<OthersStatusTypes />)} />
              <Route path="masters/others/status/:entityType" element={withSuspense(<OthersStatusManage />)} />
              <Route path="masters/others/checklists" element={withSuspense(<OthersChecklists />)} />
              <Route path="masters/others/checklists/:checklistId" element={withSuspense(<OthersChecklistBuilder />)} />
              <Route path="masters/others/character-limits" element={withSuspense(<OthersCharacterLimits />)} />
              <Route
                path="work-orders/scheduled"
                element={withModule('work_orders_scheduled', <PmScheduledRouteLayout />)}
              >
                <Route index element={withSuspense(<ScheduledWorkOrders />)} />
              </Route>
              <Route path="work-orders" element={withModule(workOrderModules, <WorkOrdersRouteLayout />)}>
                <Route index element={<Navigate to="received" replace />} />
                <Route path="received" element={withModule('work_orders_received', <ReceivedWorkOrders />)} />
                <Route path="assigned" element={withModule('work_orders_assigned', <AssignedWorkOrders />)} />
                <Route path="manual" element={withModule('work_orders_manual', <ManualWorkOrders />)} />
                <Route path="manual/create" element={withModule('work_orders_manual', <ManualWorkOrderCreate />)} />
                <Route path="manual/:workOrderId/edit" element={withModule('work_orders_manual', <ManualWorkOrderCreate />)} />
              </Route>
              <Route
                path="reports"
                element={withModule(REPORT_MODULE_KEYS, <ReportPage />)}
              />
              <Route
                path="reports/:legacy"
                element={<Navigate to=".." relative="path" replace />}
              />
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
