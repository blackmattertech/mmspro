import { useMemo, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { NavLink, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { useLocations } from '../../hooks/useLocations'
import { useWorkCenters } from '../../hooks/useWorkCenters'
import { useOrgStatusOptions } from '../../hooks/useOrgStatusOptions'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import {
  defaultWorkOrderTab,
  getWorkOrderActiveTab,
  visibleWorkOrderTabs,
} from '../../config/workOrders'
import { createFilterRule, WO_SORT_OPTIONS } from '../../lib/workOrderFilters'
import { getWorkOrdersTemplate, bulkUploadWorkOrders, exportWorkOrderList } from '../../lib/api-work-orders'
import { downloadBlobFile } from '../../lib/api'
import { useWorkOrderCounts } from '../../hooks/useWorkOrderCounts'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import { AdvancedFilterMenu, ExportCsvButton } from '../shared/ListTableChrome'
import { ColumnPickerMount, ColumnPickerScope } from '../shared/ColumnPickerSlot'
import '../shared/ListTableChrome.css'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import NavIcon from '../layout/NavIcon'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../company/MasterBulkUpload'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import './WorkOrdersPage.css'

const WO_STATUS_FALLBACK = [
  { value: 'draft', label: 'Draft' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'started', label: 'Started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_material', label: 'Waiting material' },
  { value: 'waiting_shutdown', label: 'Waiting shutdown' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'verified', label: 'Verified' },
  { value: 'closed', label: 'Closed' },
  { value: 'returned_rework', label: 'Returned / rework' },
]

const WO_PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export default function WorkOrdersLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { org } = useOrg()
  const { employee } = useProfile()
  const { locations } = useLocations()
  const { workCenters } = useWorkCenters()
  const { options: loadedStatusOptions } = useOrgStatusOptions('work_order')
  const { toolbarLeft, toolbarRight } = useWorkOrderToolbar()
  const { isOrgAdmin, canCreate, canRead, loading: permsLoading, locationId: scopedLocationId } = usePermissions()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createFilterRule()])
  const [columnFilters, setColumnFilters] = useState({})
  const [headerSort, setHeaderSort] = useState(null)
  const [statusFilters, setStatusFilters] = useState([])
  const [exporting, setExporting] = useState(false)
  const [bulkReloadToken, setBulkReloadToken] = useState(0)
  const { counts: tabCounts } = useWorkOrderCounts()
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
  const workOrderFilterFields = useMemo(() => ([
    { id: 'wo_number', label: 'WO #', placeholder: 'Enter work order number...' },
    { id: 'summary', label: 'Short description', placeholder: 'Enter keywords...' },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      emptyLabel: 'All Status',
      options: loadedStatusOptions.length ? loadedStatusOptions : WO_STATUS_FALLBACK,
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      emptyLabel: 'All Priorities',
      options: WO_PRIORITY_OPTIONS,
    },
    {
      id: 'location',
      label: 'Location',
      type: 'select',
      emptyLabel: 'All Locations',
      options: activeLocations.map((loc) => ({ value: loc.id, label: loc.name })),
    },
    {
      id: 'work_center',
      label: 'Work center',
      type: 'select',
      emptyLabel: 'All Work Centers',
      options: (workCenters || []).map((center) => ({ value: center.name, label: center.name })),
    },
    { id: 'assignee', label: 'Assignee', placeholder: 'Enter assignee...' },
    { id: 'creator', label: 'Created by', placeholder: 'Enter name...' },
    { id: 'work_request', label: 'Work request', placeholder: 'Enter work request...' },
    { id: 'created', label: 'Created', type: 'date-range', fromKey: 'created_from', toKey: 'created_to' },
  ]), [activeLocations, loadedStatusOptions, workCenters])

  const handleAddWorkOrder = () => {
    if (!org?.slug) return
    navigate(orgPath(org.slug, 'work-orders/manual/create'))
  }

  const setColumnFilter = (columnId, value) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!String(value || '').trim()) delete next[columnId]
      else next[columnId] = value
      return next
    })
  }
  const toggleStatus = (key) => {
    setStatusFilters((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ))
  }
  const exportPath = activeTab === 'received'
    ? '/received'
    : activeTab === 'assigned'
      ? '/assigned'
      : '/manual/orders'

  const exportRows = async () => {
    setExporting(true)
    try {
      const filters = { ...columnFilters }
      const file = await exportWorkOrderList(exportPath, {
        search: debouncedSearch,
        filters,
        statuses: statusFilters,
        excludeStatuses: statusFilters.length ? [] : ['draft'],
        sort: headerSort?.id || '',
        sortDir: headerSort?.dir || '',
        sort_by: headerSort ? '' : sortBy,
      })
      downloadBlobFile(file)
    } finally {
      setExporting(false)
    }
  }

  const outletContext = useMemo(() => ({
    search: debouncedSearch,
    locationFilter,
    sortBy,
    advancedRules,
    fieldFilter: { field: '', value: '' },
    locations: activeLocations,
    bulkReloadToken,
    columnFilters,
    setColumnFilter,
    headerSort,
    setHeaderSort,
    statusFilters,
    toggleStatus,
  }), [
    debouncedSearch, locationFilter, sortBy, advancedRules,
    activeLocations, bulkReloadToken, columnFilters, headerSort, statusFilters,
  ])

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
    <ColumnPickerScope>
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
                {tab.countKey && Number.isFinite(Number(tabCounts?.[tab.countKey])) && (
                  <span className="wo-page__tab-count">{tabCounts[tab.countKey]}</span>
                )}
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
                filterSlot={(
                  <AdvancedFilterMenu
                    fields={workOrderFilterFields}
                    values={columnFilters}
                    onChange={setColumnFilters}
                  />
                )}
                sort={{ value: sortBy, onChange: (value) => { setSortBy(value); setHeaderSort(null) }, options: WO_SORT_OPTIONS }}
                columnPicker={<ColumnPickerMount />}
                actions={(
                  <>
                    <ExportCsvButton onClick={exportRows} busy={exporting} />
                  {toolbarRight}
                  {canCreateWorkOrders && (
                    <MasterBulkActions
                      onDownload={handleDownloadTemplate}
                      bulkBusy={bulkBusy}
                      bulkInputRef={bulkInputRef}
                      onFileChange={handleBulkFile}
                      addLabel="+ Add Work Order"
                      onAdd={handleAddWorkOrder}
                      title="Import work orders"
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
                    title="Import work orders"
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
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
    </ColumnPickerScope>
  )
}
