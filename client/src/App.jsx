import { Suspense, useEffect } from 'react'
import { WORK_REQUEST_MODULE_KEYS, REPORT_MODULE_KEYS } from './lib/accessModules'
import { MASTER_HUB_MODULE_KEYS } from './config/navigation'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazyPage } from './lib/lazyPage'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { OrgProvider } from './hooks/useOrg'
import { PermissionsProvider } from './hooks/usePermissions'
import { ProtectedRoute, OrgRoute, AdminRoute, ModuleRoute } from './components/shared/ProtectedRoute'
import { LegacyAppRedirect, RootRedirect } from './components/shared/OrgRedirect'
const AppLayout = lazyPage(() => import('./layouts/AppLayout'))
const AdminLayout = lazyPage(() => import('./layouts/AdminLayout'))
const Login = lazyPage(() => import('./pages/auth/Login'))
const ResetPassword = lazyPage(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazyPage(() => import('./pages/app/Dashboard'))
const Calendar = lazyPage(() => import('./pages/app/Calendar'))
const Company = lazyPage(() => import('./pages/app/Company'))
const Equipment = lazyPage(() => import('./pages/app/Equipment'))
const EquipmentScan = lazyPage(() => import('./pages/app/EquipmentScan'))
const Logbook = lazyPage(() => import('./pages/app/Logbook'))
const WorkOrdersRouteLayout = lazyPage(() => import('./components/workorders/WorkOrdersRouteLayout'))
const PmScheduledRouteLayout = lazyPage(() => import('./components/workorders/PmScheduledRouteLayout'))
const ManualWorkOrders = lazyPage(() => import('./pages/app/ManualWorkOrders'))
const ManualWorkOrderCreate = lazyPage(() => import('./pages/app/ManualWorkOrderCreate'))
const ReceivedWorkOrders = lazyPage(() => import('./pages/app/ReceivedWorkOrders'))
const AssignedWorkOrders = lazyPage(() => import('./pages/app/AssignedWorkOrders'))
const ScheduledWorkOrders = lazyPage(() => import('./pages/app/ScheduledWorkOrders'))
const PlaceholderPage = lazyPage(() => import('./pages/app/PlaceholderPage'))
const OrgSettings = lazyPage(() => import('./pages/app/OrgSettings'))
const Approvals = lazyPage(() => import('./pages/app/Approvals'))
const ReportPage = lazyPage(() => import('./pages/app/reports/ReportPage'))
const TasksRouteLayout = lazyPage(() => import('./components/tasks/TasksRouteLayout'))
const TasksManager = lazyPage(() => import('./pages/app/TasksManager'))
const TaskDetailPage = lazyPage(() => import('./pages/app/TaskDetailPage'))
const TaskFormPage = lazyPage(() => import('./pages/app/TaskFormPage'))
const WarrantyManager = lazyPage(() => import('./pages/app/WarrantyManager'))
const WarrantyManagerLayout = lazyPage(() => import('./components/warranty/WarrantyManagerLayout'))
const WarrantyDetailPage = lazyPage(() => import('./pages/app/WarrantyDetailPage'))
const WarrantyFormPage = lazyPage(() => import('./pages/app/WarrantyFormPage'))
const Vendors = lazyPage(() => import('./pages/app/Vendors'))
const VendorDetailPage = lazyPage(() => import('./pages/app/VendorDetailPage'))
const Masters = lazyPage(() => import('./pages/app/Masters'))
const FormMasters = lazyPage(() => import('./pages/app/FormMasters'))
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
const OrgUnavailable = lazyPage(() => import('./pages/app/OrgUnavailable'))
const AdminDashboard = lazyPage(() => import('./pages/admin/Dashboard'))
const Organizations = lazyPage(() => import('./pages/admin/Organizations'))
const AdminOrgAssets = lazyPage(() => import('./pages/admin/AdminOrgAssets'))
const AdminOrgEquipment = lazyPage(() => import('./pages/admin/AdminOrgEquipment'))
const AdminUsers = lazyPage(() => import('./pages/admin/Users'))
const AdminIntegrations = lazyPage(() => import('./pages/admin/Integrations'))
const AdminPlans = lazyPage(() => import('./pages/admin/Plans'))
const AdminReports = lazyPage(() => import('./pages/admin/Reports'))
const AdminDefaults = lazyPage(() => import('./pages/admin/Defaults'))

const masterRoutes = ['order', 'activity']
const companyPageModules = ['company', 'locations', 'departments', 'work_centers', 'employees']
const workOrderModules = [
  'work_orders',
  'work_orders_received',
  'work_orders_assigned',
  'work_orders_manual',
]

function PrefetchAuthenticatedShell() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    import('./layouts/AppLayout')
    import('./layouts/AdminLayout')
    import('./pages/app/Dashboard')
  }, [user])
  return null
}

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
        <PermissionsProvider>
        <PrefetchAuthenticatedShell />
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
              <Route path="users" element={withSuspense(<AdminUsers />)} />
              <Route path="integrations" element={withSuspense(<AdminIntegrations />)} />
              <Route path="plans" element={withSuspense(<AdminPlans />)} />
              <Route path="reports" element={withSuspense(<AdminReports />)} />
              <Route path="default" element={withSuspense(<AdminDefaults />)} />
            </Route>

            <Route path="/:orgSlug" element={<OrgRoute>{withSuspense(<AppLayout />)}</OrgRoute>}>
              <Route index element={withSuspense(<OrgHomeRedirect />)} />
              <Route path="unavailable" element={withSuspense(<OrgUnavailable />)} />
              <Route path="dashboard" element={withModule('dashboard', <Dashboard />)} />
              <Route
                path="work-request"
                element={withModule([...WORK_REQUEST_MODULE_KEYS, 'work_request'], <WorkRequestsRouteLayout />)}
              >
                <Route index element={<Navigate to="incoming" replace />} />
                <Route path="create" element={withSuspense(<WorkRequestCreate />)} />
                <Route
                  path="my"
                  element={withSuspense(
                    <WorkRequestListPage
                      filter="my"
                      emptyHint="Work requests you submitted appear here."
                    />,
                  )}
                />
                <Route
                  path="incoming"
                  element={withSuspense(
                    <WorkRequestListPage
                      filter="incoming"
                      emptyHint="Requests routed to your department appear here."
                    />,
                  )}
                />
                <Route
                  path="outgoing"
                  element={withSuspense(
                    <WorkRequestListPage
                      filter="outgoing"
                      emptyHint="Requests your department sent to others appear here."
                    />,
                  )}
                />
                <Route
                  path="all"
                  element={withSuspense(
                    <WorkRequestListPage
                      filter="all"
                      emptyHint="No work requests in this organization yet."
                    />,
                  )}
                />
              </Route>
              <Route path="calendar" element={withModule('calendar', <Calendar />)} />
              <Route path="warranty-manager" element={withModule('warranty_manager', <WarrantyManagerLayout />)}>
                <Route index element={<Navigate to="in-warranty" replace />} />
                <Route path="in-warranty" element={withSuspense(<WarrantyManager />)} />
                <Route path="out-of-warranty" element={withSuspense(<WarrantyManager />)} />
                <Route path="soon-to-expired" element={withSuspense(<WarrantyManager />)} />
                <Route path="expired" element={withSuspense(<WarrantyManager />)} />
                <Route path="create" element={withSuspense(<WarrantyFormPage />)} />
                <Route path=":warrantyId/edit" element={withSuspense(<WarrantyFormPage />)} />
                <Route path=":warrantyId" element={withSuspense(<WarrantyDetailPage />)} />
              </Route>
              <Route path="tasks-and-followups" element={withModule('tasks_followups', <TasksRouteLayout />)}>
                <Route index element={withSuspense(<TasksManager />)} />
                <Route path="create" element={withSuspense(<TaskFormPage />)} />
                <Route path=":taskId/edit" element={withSuspense(<TaskFormPage />)} />
                <Route path=":taskId" element={withSuspense(<TaskDetailPage />)} />
              </Route>
              <Route path="masters" element={withModule(MASTER_HUB_MODULE_KEYS, <Masters />)} />
              <Route path="masters/forms/:formId/:fieldId" element={withModule('assets', <FormMasters />)} />
              <Route path="masters/forms/:formId" element={withModule('assets', <FormMasters />)} />
              <Route path="masters/forms" element={withModule('assets', <FormMasters />)} />
              <Route path="masters/company" element={withModule(companyPageModules, <Company />)} />
              <Route path="masters/assets" element={<Navigate to="../forms" relative="path" replace />} />
              <Route path="masters/equipment" element={withModule(['equipment', 'areas'], <Equipment />)} />
              <Route path="scan/equipment/:equipmentId" element={withSuspense(<EquipmentScan />)} />
              <Route path="masters/vendors" element={withModule('vendors', <Vendors />)} />
              <Route path="masters/vendors/:vendorId" element={withModule('vendors', <VendorDetailPage />)} />
              <Route path="masters/others" element={withModule('others', <Others />)} />
              <Route path="masters/others/status" element={withModule('others', <OthersStatusTypes />)} />
              <Route path="masters/others/status/:entityType" element={withModule('others', <OthersStatusManage />)} />
              <Route path="masters/others/checklists" element={withModule('others', <OthersChecklists />)} />
              <Route path="masters/others/checklists/:checklistId" element={withModule('others', <OthersChecklistBuilder />)} />
              <Route path="masters/others/character-limits" element={withModule('others', <OthersCharacterLimits />)} />
              <Route path="logbook" element={withModule('logbook', <Logbook />)} />
              <Route
                path="work-orders/scheduled"
                element={withModule('work_orders_scheduled', <PmScheduledRouteLayout />)}
              >
                <Route index element={withSuspense(<ScheduledWorkOrders />)} />
              </Route>
              <Route path="work-orders" element={withModule(workOrderModules, <WorkOrdersRouteLayout />)}>
                <Route index element={<Navigate to="received" replace />} />
                <Route path="received" element={withSuspense(<ReceivedWorkOrders />)} />
                <Route path="assigned" element={withSuspense(<AssignedWorkOrders />)} />
                <Route path="manual" element={withSuspense(<ManualWorkOrders />)} />
                <Route path="manual/create" element={withSuspense(<ManualWorkOrderCreate />)} />
                <Route path="manual/:workOrderId/edit" element={withSuspense(<ManualWorkOrderCreate />)} />
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
                path="configuration/approvals"
                element={withModule('approvals', <Approvals />)}
              />
              <Route
                path="configuration/settings"
                element={withModule('settings', <OrgSettings />)}
              />
              <Route
                path="configuration/import"
                element={withModule('import', <ConfigurationImport />)}
              />
              <Route
                path="configuration/export"
                element={withModule('export', <PlaceholderPage title="Export" />)}
              />
            </Route>

            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        </PermissionsProvider>
      </OrgProvider>
    </AuthProvider>
  )
}
