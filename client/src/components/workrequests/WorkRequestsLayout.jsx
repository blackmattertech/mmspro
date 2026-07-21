import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { usePermissions } from '../../hooks/usePermissions'
import { useDepartments } from '../../hooks/useDepartments'
import { orgPath } from '../../config/navigation'
import {
  WORK_REQUEST_TABS,
  isWorkRequestTabActive,
} from '../../config/workRequests'
import {
  createWorkRequestFilterRule,
  countActiveWorkRequestFilterRules,
  WR_STATUS_FILTER_OPTIONS,
  WR_PRIORITY_FILTER_OPTIONS,
  WR_SORT_OPTIONS,
} from '../../lib/workRequestFilters'
import WorkRequestAdvancedFilter from './WorkRequestAdvancedFilter'
import FilterableSelect from '../ui/FilterableSelect'
import NavIcon from '../layout/NavIcon'
import '../company/CompanyShared.css'
import '../workorders/WorkOrdersPage.css'
import '../workorders/WorkOrderAdvancedFilter.css'
import './WorkRequests.css'

export default function WorkRequestsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canRead, canCreate } = usePermissions()
  const { departments } = useDepartments('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createWorkRequestFilterRule()])

  const isCreatePage = location.pathname.includes('/work-request/create')
  const isListPage = !isCreatePage

  const visibleTabs = useMemo(
    () => WORK_REQUEST_TABS.filter((tab) => canRead(tab.moduleKey) || canRead('work_request')),
    [canRead],
  )

  const activeDepartments = useMemo(
    () => (departments || []).filter((d) => d.is_active !== false),
    [departments],
  )

  const advancedCount = countActiveWorkRequestFilterRules(advancedRules)
  const quickFilterCount = (statusFilter !== 'all' ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0)
  const totalFilterCount = advancedCount + quickFilterCount

  const canCreateRequest = canCreate('work_request_create') || canCreate('work_request')

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <h1 className="wo-page__title">Work Requests</h1>
          <p className="wo-page__subtitle">Create, track, and manage maintenance requests</p>
        </div>
      </header>

      <div className="wr-page__toolbar">
        <div className="wr-page__toolbar-row wr-page__toolbar-row--tabs">
          <nav className="wo-page__tabs" aria-label="Work request views">
            {visibleTabs.map((tab) => {
              const isActive = isWorkRequestTabActive(tab.id, location.pathname)
              return (
                <Link
                  key={tab.id}
                  to={org?.slug ? orgPath(org.slug, tab.segment) : '#'}
                  className={`wo-page__tab${isActive ? ' wo-page__tab--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {isListPage && (
          <div className="wr-page__toolbar-row wr-page__toolbar-row--filters">
            <div className="wo-page__bar-controls wr-page__bar-controls">
              <input
                type="search"
                className="company-form__input wo-page__search"
                placeholder="Search work requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search work requests"
              />

              <div className="wo-page__location-filter">
                <label htmlFor="wr-status-filter" className="wo-page__location-label">Status</label>
                <FilterableSelect
                  id="wr-status-filter"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={WR_STATUS_FILTER_OPTIONS}
                  getOptionValue={(opt) => opt.value}
                  getOptionLabel={(opt) => opt.label}
                  allowEmpty={false}
                  inputClassName="wo-page__location-select"
                />
              </div>

              <div className="wo-page__location-filter">
                <label htmlFor="wr-priority-filter" className="wo-page__location-label">Priority</label>
                <FilterableSelect
                  id="wr-priority-filter"
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={WR_PRIORITY_FILTER_OPTIONS}
                  getOptionValue={(opt) => opt.value}
                  getOptionLabel={(opt) => opt.label}
                  allowEmpty={false}
                  inputClassName="wo-page__location-select"
                />
              </div>

              <div className="wo-page__location-filter">
                <label htmlFor="wr-sort" className="wo-page__location-label">Sort</label>
                <FilterableSelect
                  id="wr-sort"
                  value={sortBy}
                  onChange={setSortBy}
                  options={WR_SORT_OPTIONS}
                  getOptionValue={(opt) => opt.value}
                  getOptionLabel={(opt) => opt.label}
                  allowEmpty={false}
                  inputClassName="wo-page__location-select"
                />
              </div>

              <WorkRequestAdvancedFilter
                rules={advancedRules}
                onChange={setAdvancedRules}
                departments={activeDepartments}
                activeCount={totalFilterCount}
              />

              {canCreateRequest && (
                <button
                  type="button"
                  className="wr-page__create-btn"
                  onClick={() => org?.slug && navigate(orgPath(org.slug, 'work-request/create'))}
                  aria-label="Create work request"
                  title="Create work request"
                >
                  <NavIcon name="addSquare" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="wo-page__content">
        {isCreatePage ? (
          <Outlet />
        ) : (
          <div className="company-panel">
            <Outlet context={{
              search,
              statusFilter,
              priorityFilter,
              sortBy,
              advancedRules,
              departments: activeDepartments,
            }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
