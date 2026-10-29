import { useEffect, useMemo, useState } from 'react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { useCatalogFields } from '../../hooks/useCatalogFields'
import { mergePickerColumns } from '../../lib/pickerFields'
import { orgPath } from '../../config/navigation'
import {
  defaultWorkRequestTab,
  getWorkRequestActiveTab,
  visibleWorkRequestTabs,
} from '../../config/workRequests'
import { useDepartments } from '../../hooks/useDepartments'
import { WR_PRIORITY_FILTER_OPTIONS, WR_SORT_OPTIONS, WR_STATUS_FILTER_OPTIONS } from '../../lib/workRequestFilters'
import { getWorkRequestsTemplate, bulkUploadWorkRequests, exportWorkRequests, getWorkRequestTabCounts, listWorkRequests } from '../../lib/api-work-requests'
import { uniqueNameOptions } from '../../lib/tableFilters'
import { peekReferenceData, seedReferenceData } from '../../lib/referenceDataCache'
import { TAB_COUNTS_EVENT } from '../../lib/tabCountEvents'
import { downloadBlobFile } from '../../lib/api'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import TableColumnPicker from '../shared/TableColumnPicker'
import { AdvancedFilterMenu } from '../shared/ListTableChrome'
import { ExportCsvButton } from '../shared/ListTableChrome'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import NavIcon from '../layout/NavIcon'
import { WORK_REQUEST_COLUMNS } from './workRequestColumns'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../company/MasterBulkUpload'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import '../shared/TableColumnPicker.css'
import '../shared/ListTableChrome.css'
import '../workorders/WorkOrdersPage.css'
import './WorkRequests.css'

export default function WorkRequestsLayout() {
  const location = useLocation()
  const { org } = useOrg()
  const { canRead, canCreate, loading: permsLoading } = usePermissions()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [sortBy, setSortBy] = useState('newest')
  const [columnFilters, setColumnFilters] = useState({})
  const [headerSort, setHeaderSort] = useState(null)
  const [statusFilters, setStatusFilters] = useState([])
  const [tabCounts, setTabCounts] = useState(
    () => peekReferenceData('tab-counts', { module: 'work_requests' }) || {},
  )
  const [exporting, setExporting] = useState(false)
  const [bulkReloadToken, setBulkReloadToken] = useState(0)
  const canCreateRequest = canCreate('work_request_create') || canCreate('work_request')
  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getWorkRequestsTemplate,
    upload: bulkUploadWorkRequests,
    onSuccess: () => setBulkReloadToken((value) => value + 1),
    defaultFilename: 'work-requests-template.xlsx',
  })

  const tabs = useMemo(
    () => (permsLoading ? [] : visibleWorkRequestTabs(canRead)),
    [canRead, permsLoading],
  )
  const listTabs = tabs.filter((tab) => tab.id !== 'create')
  const createTab = tabs.find((tab) => tab.id === 'create') || null
  const activeTab = getWorkRequestActiveTab(location.pathname)
  const listFilter = activeTab && activeTab !== 'create' ? activeTab : null
  const isCreatePage = activeTab === 'create'
  const isListPage = Boolean(listFilter)
  const onIndex = /\/work-request\/?$/.test(location.pathname)
  const fallbackTab = defaultWorkRequestTab(canRead)

  const { departments } = useDepartments()
  const [filterRows, setFilterRows] = useState([])
  useEffect(() => {
    if (!listFilter) {
      setFilterRows([])
      return undefined
    }
    let cancelled = false
    listWorkRequests(listFilter, { limit: 200, offset: 0 })
      .then((rows) => { if (!cancelled) setFilterRows(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setFilterRows([]) })
    return () => { cancelled = true }
  }, [listFilter])
  const requestFilterFields = useMemo(() => ([
    {
      id: 'wr_number',
      label: 'WR #',
      type: 'select',
      emptyLabel: 'All WR #',
      options: uniqueNameOptions(filterRows, (row) => row.request_number || row.wr_number),
    },
    {
      id: 'problem',
      label: 'Short description',
      type: 'select',
      emptyLabel: 'All descriptions',
      options: uniqueNameOptions(filterRows, (row) => row.short_description || row.problem_description),
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      emptyLabel: 'All Types',
      options: [
        { value: 'inter_department', label: 'Inter department' },
        { value: 'intra_department', label: 'Intra department' },
        { value: 'user_self', label: 'Self' },
      ],
    },
    {
      id: 'order_from',
      label: 'From Department',
      type: 'select',
      emptyLabel: 'All Departments',
      options: (departments || []).map((dept) => ({ value: dept.name, label: dept.name })),
    },
    {
      id: 'order_to',
      label: 'To Department',
      type: 'select',
      emptyLabel: 'All Departments',
      options: (departments || []).map((dept) => ({ value: dept.name, label: dept.name })),
    },
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      emptyLabel: 'All Priorities',
      options: WR_PRIORITY_FILTER_OPTIONS.filter((option) => option.value !== 'all'),
    },
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      emptyLabel: 'All Status',
      options: WR_STATUS_FILTER_OPTIONS.filter((option) => option.value !== 'all'),
    },
    { id: 'request_date', label: 'Requested Date', type: 'date-range' },
  ]), [departments, filterRows])
  const catalogFields = useCatalogFields()
  const requestColumns = useMemo(
    () => mergePickerColumns(WORK_REQUEST_COLUMNS, catalogFields),
    [catalogFields],
  )
  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
    saveColumns,
    columnOrder,
    columnDefs,
  } = useTableColumnPrefs(
    listFilter ? `work-requests-${listFilter}` : '',
    requestColumns,
  )

  const toggleStatus = (key) => {
    setStatusFilters((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ))
  }

  const setColumnFilter = (columnId, value) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!String(value || '').trim()) delete next[columnId]
      else next[columnId] = value
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getWorkRequestTabCounts()
        .then((counts) => {
          if (cancelled || !counts || typeof counts !== 'object') return
          const next = {
            my: Number(counts.my) || 0,
            incoming: Number(counts.incoming) || 0,
            outgoing: Number(counts.outgoing) || 0,
            all: Number(counts.all) || 0,
          }
          setTabCounts(next)
          seedReferenceData('tab-counts', { module: 'work_requests' }, next)
        })
        .catch(() => {})
    }
    load()
    const onChange = (event) => {
      if (event.detail?.module && event.detail.module !== 'work_requests') return
      load()
    }
    window.addEventListener(TAB_COUNTS_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(TAB_COUNTS_EVENT, onChange)
    }
  }, [bulkReloadToken, org?.id, location.pathname])

  const outletContext = useMemo(() => ({
    listFilter,
    search: debouncedSearch,
    fieldFilter: { field: '', value: '' },
    sortBy,
    columnFilters,
    setColumnFilter,
    headerSort,
    setHeaderSort,
    statusFilters,
    toggleStatus,
    visibleColumnIds,
    columnDefs: requestColumns,
    bulkReloadToken,
  }), [
    listFilter, debouncedSearch, sortBy, columnFilters,
    headerSort, statusFilters, visibleColumnIds, requestColumns, bulkReloadToken,
  ])

  const exportRows = async () => {
    if (!listFilter) return
    setExporting(true)
    try {
      const filters = { ...columnFilters }
      const file = await exportWorkRequests(listFilter, {
        search: debouncedSearch,
        filters,
        statuses: statusFilters,
        excludeStatuses: statusFilters.length ? [] : ['draft'],
        sort: headerSort?.id || '',
        sortDir: headerSort?.dir || '',
        sortBy: headerSort ? '' : sortBy,
      })
      downloadBlobFile(file)
    } finally {
      setExporting(false)
    }
  }

  if (!permsLoading && onIndex && org?.slug && fallbackTab) {
    return <Navigate to={orgPath(org.slug, fallbackTab.segment)} replace />
  }

  if (
    !permsLoading
    && activeTab
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
          <h1 className="wo-page__title">Work Requests</h1>
          <p className="wo-page__subtitle">Create, track, and manage maintenance requests</p>
        </div>
      </header>

      <div className="wr-page__toolbar">
        <div className="wr-page__toolbar-row wr-page__toolbar-row--tabs">
          <nav className="wo-page__tabs" aria-label="Work request views">
            {listTabs.map((tab) => (
              <NavLink
                key={tab.id}
                to={org?.slug ? orgPath(org.slug, tab.segment) : '#'}
                end
                className={({ isActive }) =>
                  `wo-page__tab${isActive ? ' wo-page__tab--active' : ''}`
                }
              >
                {tab.icon ? <NavIcon name={tab.icon} /> : null}
                {tab.label}
                {Number.isFinite(Number(tabCounts[tab.id])) && (
                  <span className="wo-page__tab-count">{tabCounts[tab.id]}</span>
                )}
              </NavLink>
            ))}
          </nav>
          {createTab && (
            <NavLink
              to={org?.slug ? orgPath(org.slug, createTab.segment) : '#'}
              end
              className={({ isActive }) =>
                `wo-page__tab wr-page__create-tab${isActive ? ' wo-page__tab--active' : ''}`
              }
            >
              {createTab.icon ? <NavIcon name={createTab.icon} /> : null}
              Create
            </NavLink>
          )}
          {canCreateRequest && isCreatePage && (
            <div className="wr-page__tab-actions">
              <MasterBulkActions
                onDownload={handleDownloadTemplate}
                bulkBusy={bulkBusy}
                bulkInputRef={bulkInputRef}
                onFileChange={handleBulkFile}
                title="Import work requests"
                noun="work request"
                bulkError={bulkError}
                bulkResult={bulkResult}
                actionLabel="Import"
                showToolbarDownload={false}
              />
            </div>
          )}
        </div>

        {isListPage && (
          <div className="wr-page__toolbar-row wr-page__toolbar-row--filters">
            <TableFilterToolbar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: 'Search work requests...',
                ariaLabel: 'Search work requests',
              }}
              filterSlot={(
                <AdvancedFilterMenu
                  fields={requestFilterFields}
                  values={columnFilters}
                  onChange={setColumnFilters}
                  hideLabel
                />
              )}
              sort={{ value: sortBy, onChange: (value) => { setSortBy(value); setHeaderSort(null) }, options: WR_SORT_OPTIONS }}
              actions={(
                <>
                  <ExportCsvButton onClick={exportRows} busy={exporting} />
                  {canCreateRequest ? (
                <MasterBulkActions
                  onDownload={handleDownloadTemplate}
                  bulkBusy={bulkBusy}
                  bulkInputRef={bulkInputRef}
                  onFileChange={handleBulkFile}
                  title="Import work requests"
                  noun="work request"
                  bulkError={bulkError}
                  bulkResult={bulkResult}
                  actionLabel="Import"
                  showToolbarDownload={false}
                />
                  ) : null}
                </>
              )}
              columnPicker={(
                <TableColumnPicker
                  key={listFilter}
                  columnDefs={columnDefs}
                  visibleColumnIds={visibleColumnIds}
                  columnOrder={columnOrder}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                  onReorder={reorderColumns}
                  onMove={moveColumn}
                  onSave={saveColumns}
                />
              )}
            />
          </div>
        )}
      </div>

      <div className="wo-page__content">
        {isCreatePage ? (
          <Outlet />
        ) : (
          <div className="company-panel">
            <Outlet context={outletContext} />
          </div>
        )}
      </div>
    </div>
  )
}
