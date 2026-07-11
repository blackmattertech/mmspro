import { useState, useEffect, useMemo } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { useLocations } from '../../hooks/useLocations'
import { useWorkOrderCounts } from '../../hooks/useWorkOrderCounts'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { WORK_ORDER_TABS, getWorkOrderActiveTab, isWorkOrderTabActive } from '../../config/workOrders'
import { createFilterRule, countActiveAdvancedRules } from '../../lib/workOrderFilters'
import WorkOrderTypeModal from './WorkOrderTypeModal'
import WorkOrderAdvancedFilter from './WorkOrderAdvancedFilter'
import '../company/CompanyShared.css'
import './WorkOrdersPage.css'
import './WorkOrderAdvancedFilter.css'

export default function WorkOrdersLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { org } = useOrg()
  const { employee } = useProfile()
  const { locations } = useLocations()
  const { counts } = useWorkOrderCounts()
  const { toolbarLeft, toolbarRight } = useWorkOrderToolbar()
  const { isOrgAdmin, canCreate, canRead, locationId: scopedLocationId } = usePermissions()
  const [locationFilter, setLocationFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [advancedRules, setAdvancedRules] = useState([createFilterRule()])
  const [showCreateModal, setShowCreateModal] = useState(false)

  const canSeeAllLocations = isOrgAdmin
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const userLocationId = scopedLocationId || employee?.location_id || null

  const isCreatePage = location.pathname.includes('/work-orders/manual/create')
  const visibleTabs = useMemo(
    () => WORK_ORDER_TABS.filter((tab) => canRead(tab.moduleKey) || canRead('work_orders')),
    [canRead],
  )
  const activeTab = getWorkOrderActiveTab(location.pathname)
  const activeLocations = useMemo(() => {
    const all = (locations || []).filter((loc) => loc.is_active !== false)
    if (canSeeAllLocations) return all
    if (!userLocationId) return []
    return all.filter((loc) => loc.id === userLocationId)
  }, [locations, canSeeAllLocations, userLocationId])

  useEffect(() => {
    if (!canSeeAllLocations && userLocationId) {
      setLocationFilter(userLocationId)
    }
  }, [canSeeAllLocations, userLocationId])

  const advancedFilterCount = countActiveAdvancedRules(advancedRules)
  const locationFilterActive = locationFilter !== 'all' ? 1 : 0
  const totalFilterCount = advancedFilterCount + locationFilterActive

  const handleAddWorkOrder = () => {
    if (activeTab === 'manual' && org?.slug) {
      navigate(orgPath(org.slug, 'work-orders/manual/create'))
      return
    }
    setShowCreateModal(true)
  }

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <h1 className="wo-page__title">Work Orders</h1>
          <p className="wo-page__subtitle">Manage and track all maintenance work orders</p>
        </div>
      </header>

      <div className="wo-page__bar">
        <nav className="wo-page__tabs" aria-label="Work order types">
          {visibleTabs.map((tab) => {
            const isActive = isWorkOrderTabActive(tab.id, location.pathname)
            return (
              <Link
                key={tab.id}
                to={org?.slug ? orgPath(org.slug, tab.segment) : '#'}
                className={`wo-page__tab${isActive ? ' wo-page__tab--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
                <span className="wo-page__tab-count">{counts[tab.countKey] ?? 0}</span>
              </Link>
            )
          })}
        </nav>

        <div className="wo-page__bar-controls">
          {!isCreatePage && (
            <div className="wo-page__location-filter">
              <label htmlFor="wo-location-filter" className="wo-page__location-label">Location</label>
              <select
                id="wo-location-filter"
                className="wo-page__location-select"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                disabled={!canSeeAllLocations}
              >
                {canSeeAllLocations && <option value="all">All Locations</option>}
                {activeLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}

          {toolbarLeft}

          {!isCreatePage && (
            <input
              type="search"
              className="company-form__input wo-page__search"
              placeholder="Search work orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          {!isCreatePage && (
            <WorkOrderAdvancedFilter
              rules={advancedRules}
              onChange={setAdvancedRules}
              locations={activeLocations}
              activeCount={totalFilterCount}
            />
          )}

          {toolbarRight}

          {!isCreatePage && canCreateWorkOrders && (
            <button
              type="button"
              className="company-btn company-btn--primary wo-page__add-btn"
              onClick={handleAddWorkOrder}
            >
              + Add Work Order
            </button>
          )}
        </div>
      </div>

      <div className="wo-page__content">
        <div className="company-panel">
          <Outlet context={{
            search,
            locationFilter,
            advancedRules,
            locations: activeLocations,
          }}
          />
        </div>
      </div>

      {showCreateModal && (
        <WorkOrderTypeModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}
