import { useState, useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useOrg } from '../../hooks/useOrg'
import { useProfile } from '../../hooks/useProfile'
import { useLocations } from '../../hooks/useLocations'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { orgPath } from '../../config/navigation'
import { createFilterRule, countActiveAdvancedRules, WO_SORT_OPTIONS } from '../../lib/workOrderFilters'
import WorkOrderAdvancedFilter from './WorkOrderAdvancedFilter'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
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
  const { isOrgAdmin, canCreate, locationId: scopedLocationId } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createFilterRule()])

  const canSeeAllLocations = isOrgAdmin
  const canCreateWorkOrders = canCreate('work_orders_manual') || canCreate('work_orders')
  const userLocationId = scopedLocationId || employee?.location_id || null

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
  }), [search, locationFilter, sortBy, advancedRules, filterField, filterValue, activeLocations])

  return (
    <div className="company-page wo-page">
      <header className="wo-page__top">
        <div className="wo-page__intro">
          <PageBreadcrumbs />
          <h1 className="wo-page__title">Work Orders</h1>
          <p className="wo-page__subtitle">Manage and track all maintenance work orders</p>
        </div>
      </header>

      <div className="wo-page__bar">
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
                    <button
                      type="button"
                      className="company-btn company-btn--primary wo-page__add-btn"
                      onClick={handleAddWorkOrder}
                    >
                      + Add Work Order
                    </button>
                  )}
                </>
              )}
            />
          )}

          {isFormPage && toolbarRight}
        </div>
      </div>

      <div className="wo-page__content">
        <div className="company-panel">
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
  )
}
