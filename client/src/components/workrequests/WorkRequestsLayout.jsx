import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { orgPath } from '../../config/navigation'
import { getWorkRequestActiveTab } from '../../config/workRequests'
import { WR_SORT_OPTIONS } from '../../lib/workRequestFilters'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import TableColumnPicker from '../shared/TableColumnPicker'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import NavIcon from '../layout/NavIcon'
import { WORK_REQUEST_COLUMNS } from './workRequestColumns'
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
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canCreate } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  const activeTab = getWorkRequestActiveTab(location.pathname)
  const listFilter = activeTab && activeTab !== 'create' ? activeTab : null
  const isCreatePage = activeTab === 'create'
  const isListPage = Boolean(listFilter)

  const {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
    columnDefs,
  } = useTableColumnPrefs(
    listFilter ? `work-requests-${listFilter}` : '',
    WORK_REQUEST_COLUMNS,
  )

  const canCreateRequest = canCreate('work_request_create') || canCreate('work_request')

  const outletContext = useMemo(() => ({
    search,
    fieldFilter: { field: filterField, value: filterValue },
    sortBy,
    visibleColumnIds,
  }), [search, filterField, filterValue, sortBy, visibleColumnIds])

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Work Requests</h1>
          <p className="wo-page__subtitle">Create, track, and manage maintenance requests</p>
        </div>
      </header>

      {isListPage && (
        <div className="wr-page__toolbar">
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
                <button
                  type="button"
                  className="wr-page__create-btn"
                  onClick={() => org?.slug && navigate(orgPath(org.slug, 'work-request/create'))}
                  aria-label="Create work request"
                  title="Create work request"
                >
                  <NavIcon name="addSquare" />
                </button>
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
        </div>
      )}

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
