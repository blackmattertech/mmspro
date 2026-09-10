import { useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useLocations } from '../../hooks/useLocations'
import { usePermissions } from '../../hooks/usePermissions'
import { useProfile } from '../../hooks/useProfile'
import { WorkOrderToolbarProvider, useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { createFilterRule, countActiveAdvancedRules, WO_SORT_OPTIONS } from '../../lib/workOrderFilters'
import WorkOrderAdvancedFilter from './WorkOrderAdvancedFilter'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import './WorkOrdersPage.css'
import './WorkOrderAdvancedFilter.css'

const FILTER_FIELDS = [
  { value: 'location', label: 'Location' },
  { value: 'status', label: 'Status' },
  { value: 'summary', label: 'Summary' },
  { value: 'wo_number', label: 'WO #' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'creator', label: 'Created by' },
]

function PmScheduledLayoutInner() {
  const { employee } = useProfile()
  const { locations } = useLocations()
  const { toolbarLeft, toolbarRight } = useWorkOrderToolbar()
  const { isOrgAdmin, locationId: scopedLocationId } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createFilterRule()])

  const canSeeAllLocations = isOrgAdmin
  const userLocationId = scopedLocationId || employee?.location_id || null

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
          <h1 className="wo-page__title">PM Schedule</h1>
          <p className="wo-page__subtitle">
            Plan preventive maintenance and track scheduled work orders
          </p>
        </div>
      </header>

      <div className="wo-page__bar">
        <div className="wo-page__bar-controls">
          {toolbarLeft}
          <TableFilterToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Search plans & work orders...',
              ariaLabel: 'Search PM and scheduled work orders',
            }}
            filter={{
              fields: FILTER_FIELDS,
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
              </>
            )}
          />
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

export default function PmScheduledRouteLayout() {
  return (
    <WorkOrderToolbarProvider>
      <PmScheduledLayoutInner />
    </WorkOrderToolbarProvider>
  )
}
