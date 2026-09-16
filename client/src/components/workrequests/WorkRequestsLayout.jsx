import { useMemo, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { orgPath } from '../../config/navigation'
import {
  defaultWorkRequestTab,
  getWorkRequestActiveTab,
  visibleWorkRequestTabs,
} from '../../config/workRequests'
import { WR_SORT_OPTIONS } from '../../lib/workRequestFilters'
import { getWorkRequestsTemplate, bulkUploadWorkRequests } from '../../lib/api-work-requests'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import TableColumnPicker from '../shared/TableColumnPicker'
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
import '../workorders/WorkOrdersPage.css'
import './WorkRequests.css'

const WR_FILTER_FIELDS = [
  { value: 'status', label: 'Status', placeholder: 'e.g. submitted, approved' },
  { value: 'priority', label: 'Priority', placeholder: 'high, medium, or low' },
  { value: 'request_number', label: 'Request #' },
  { value: 'description', label: 'Short description' },
  { value: 'type', label: 'Type', placeholder: 'inter, intra, self, or manual' },
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'requester', label: 'Requester' },
]

export default function WorkRequestsLayout() {
  const location = useLocation()
  const { org } = useOrg()
  const { canRead, canCreate, loading: permsLoading } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
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
  const activeTab = getWorkRequestActiveTab(location.pathname)
  const listFilter = activeTab && activeTab !== 'create' ? activeTab : null
  const isCreatePage = activeTab === 'create'
  const isListPage = Boolean(listFilter)
  const onIndex = /\/work-request\/?$/.test(location.pathname)
  const fallbackTab = defaultWorkRequestTab(canRead)

  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
    columnDefs,
  } = useTableColumnPrefs(
    listFilter ? `work-requests-${listFilter}` : '',
    WORK_REQUEST_COLUMNS,
  )

  const outletContext = useMemo(() => ({
    search,
    fieldFilter: { field: filterField, value: filterValue },
    sortBy,
    visibleColumnIds,
    bulkReloadToken,
  }), [search, filterField, filterValue, sortBy, visibleColumnIds, bulkReloadToken])

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
            {tabs.map((tab) => (
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
              </NavLink>
            ))}
          </nav>
          {canCreateRequest && isCreatePage && (
            <div className="wr-page__tab-actions">
              <MasterBulkActions
                onDownload={handleDownloadTemplate}
                bulkBusy={bulkBusy}
                bulkInputRef={bulkInputRef}
                onFileChange={handleBulkFile}
                title="Bulk upload work requests"
                noun="work request"
                bulkError={bulkError}
                bulkResult={bulkResult}
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
              filter={{
                fields: WR_FILTER_FIELDS,
                field: filterField,
                onFieldChange: setFilterField,
                value: filterValue,
                onValueChange: setFilterValue,
              }}
              sort={{ value: sortBy, onChange: setSortBy, options: WR_SORT_OPTIONS }}
              actions={canCreateRequest ? (
                <MasterBulkActions
                  onDownload={handleDownloadTemplate}
                  bulkBusy={bulkBusy}
                  bulkInputRef={bulkInputRef}
                  onFileChange={handleBulkFile}
                  title="Bulk upload work requests"
                  noun="work request"
                  bulkError={bulkError}
                  bulkResult={bulkResult}
                />
              ) : null}
              columnPicker={(
                <TableColumnPicker
                  key={listFilter}
                  columnDefs={columnDefs}
                  visibleColumnIds={visibleColumnIds}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
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
            <Outlet key={listFilter} context={outletContext} />
          </div>
        )}
      </div>
    </div>
  )
}
