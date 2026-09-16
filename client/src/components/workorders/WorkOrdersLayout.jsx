import { useMemo, useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { useLocations } from '../../hooks/useLocations'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import {
  defaultWorkOrderTab,
  getWorkOrderActiveTab,
  visibleWorkOrderTabs,
} from '../../config/workOrders'
import { createFilterRule, countActiveAdvancedRules, WO_SORT_OPTIONS } from '../../lib/workOrderFilters'
import { getWorkOrdersTemplate, bulkUploadWorkOrders } from '../../lib/api-work-orders'
import WorkOrderAdvancedFilter from './WorkOrderAdvancedFilter'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import NavIcon from '../layout/NavIcon'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../company/MasterBulkUpload'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import './WorkOrdersPage.css'
import './WorkOrderAdvancedFilter.css'

const WO_FILTER_FIELDS = [
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status' },
  { value: 'summary', label: 'Short description' },
  { value: 'wo_number', label: 'WO #' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'creator', label: 'Created by' },
]

export default function WorkOrdersLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { org } = useOrg()
  const { employee } = useProfile()
  const { locations } = useLocations()
  const { toolbarLeft, toolbarRight } = useWorkOrderToolbar()
  const { isOrgAdmin, canCreate, canRead, loading: permsLoading, locationId: scopedLocationId } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createFilterRule()])
  const [bulkReloadToken, setBulkReloadToken] = useState(0)
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getWorkOrdersTemplate,
    upload: bulkUploadWorkOrders,
    onSuccess: () => setBulkReloadToken((value) => value + 1),
    defaultFilename: 'work-orders-template.xlsx',
  })

  const canSeeAllLocations = isOrgAdmin
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const userLocationId = scopedLocationId || employee?.location_id || null

  const tabs = useMemo(
    () => (permsLoading ? [] : visibleWorkOrderTabs(canRead)),
    [canRead, permsLoading],
  )
  const activeTab = getWorkOrderActiveTab(location.pathname)
  const fallbackTab = defaultWorkOrderTab(canRead)
  const onIndex = /\/work-orders\/?$/.test(location.pathname)
  const isCreatePage = location.pathname.includes('/work-orders/manual/create')
  const isEditPage = /\/work-orders\/manual\/[^/]+\/edit(?:\/|$)/.test(location.pathname)
  const isFormPage = isCreatePage || isEditPage

  const activeLocations = useMemo(() => {
    const all = (locations || []).filter((loc) => loc.is_active !== false)
    if (canSeeAllLocations) return all
    if (!userLocationId) return []
    return all.filter((loc) => loc.id === userLocationId)
  }, [locations, canSeeAllLocations, userLocationId])

  const locationFilter = canSeeAllLocations ? 'all' : (userLocationId || 'all')
  const advancedFilterCount = countActiveAdvancedRules(advancedRules)
  const fieldFilterActive = filterField && String(filterValue || '').trim() ? 1 : 0
  const totalFilterCount = advancedFilterCount + fieldFilterActive

  const handleAddWorkOrder = () => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, 'work-orders/manual/create'))
  }

  const outletContext = useMemo(() => ({
    search,
    locationFilter,
    sortBy,
    advancedRules,
    fieldFilter: { field: filterField, value: filterValue },
    locations: activeLocations,
    bulkReloadToken,
  }), [search, locationFilter, sortBy, advancedRules, filterField, filterValue, activeLocations, bulkReloadToken])

  if (!permsLoading && onIndex && org?.slug && fallbackTab) {
    return <Navigate to={orgPath(org.slug, fallbackTab.segment)} replace />
  }

  if (
    !permsLoading
    && activeTab
    && !isFormPage
    && org?.slug
    && tabs.length
    && !tabs.some((tab) => tab.id === activeTab)
    && fallbackTab
  ) {
    return <Navigate to={orgPath(org.slug, fallbackTab.segment)} replace />
  }

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Work Orders</h1>
          <p className="wo-page__subtitle">Manage and track all maintenance work orders</p>
        </div>
      </header>

      <div className="wo-page__toolbar">
        <div className="wo-page__toolbar-row wo-page__toolbar-row--tabs">
          <nav className="wo-page__tabs" aria-label="Work order views">
            {tabs.map((tab) => (
              <NavLink
                key={tab.id}
                to={org?.slug ? orgPath(org.slug, tab.segment) : '#'}
                end={tab.id !== 'manual'}
                className={({ isActive }) =>
                  `wo-page__tab${isActive ? ' wo-page__tab--active' : ''}`
                }
              >
                {tab.icon ? <NavIcon name={tab.icon} /> : null}
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="wo-page__toolbar-row wo-page__toolbar-row--filters">
          <div className="wo-page__bar-controls">
            {toolbarLeft}

            {!isFormPage && (
              <TableFilterToolbar
                search={{
                  value: search,
                  onChange: setSearch,
                  placeholder: 'Search work orders...',
                  ariaLabel: 'Search work orders',
                }}
                filter={{
                  fields: WO_FILTER_FIELDS,
                  field: filterField,
                  onFieldChange: setFilterField,
                  value: filterValue,
                  onValueChange: setFilterValue,
                }}
                sort={{ value: sortBy, onChange: setSortBy, options: WO_SORT_OPTIONS }}
                actions={(
                  <>
                    <WorkOrderAdvancedFilter
                      rules={advancedRules}
                      onChange={setAdvancedRules}
                      locations={activeLocations}
                      activeCount={totalFilterCount}
                    />
                  {toolbarRight}
                  {canCreateWorkOrders && (
                    <MasterBulkActions
                      onDownload={handleDownloadTemplate}
                      bulkBusy={bulkBusy}
                      bulkInputRef={bulkInputRef}
                      onFileChange={handleBulkFile}
                      addLabel="+ Add Work Order"
                      onAdd={handleAddWorkOrder}
                      title="Bulk upload work orders"
                      noun="work order"
                      bulkError={bulkError}
                      bulkResult={bulkResult}
                    />
                  )}
                  </>
                )}
              />
            )}

            {isFormPage && (
              <>
                {toolbarRight}
                {canCreateWorkOrders && (
                  <MasterBulkActions
                    onDownload={handleDownloadTemplate}
                    bulkBusy={bulkBusy}
                    bulkInputRef={bulkInputRef}
                    onFileChange={handleBulkFile}
                    title="Bulk upload work orders"
                    noun="work order"
                    bulkError={bulkError}
                    bulkResult={bulkResult}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="wo-page__content">
        <div className="company-panel">
          <Outlet key={location.pathname} context={outletContext} />
        </div>
      </div>
    </div>
  )
}
