import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useLocations } from '../../hooks/useLocations'
import { useEmployees } from '../../hooks/useEmployees'
import { uniqueNameOptions } from '../../lib/tableFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { useProfile } from '../../hooks/useProfile'
import { WorkOrderToolbarProvider, useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { createFilterRule, WO_SORT_OPTIONS } from '../../lib/workOrderFilters'
import {
  PM_PLAN_SORT_OPTIONS,
  PM_PLAN_STATUS_FILTER_OPTIONS,
  createPmPlanFilterRule,
} from '../../lib/pmPlanFilters'
import TableFilterToolbar from '../shared/TableFilterToolbar'
import TableColumnPicker from '../shared/TableColumnPicker'
import { AdvancedFilterMenu, ExportCsvButton } from '../shared/ListTableChrome'
import { ColumnPickerMount, ColumnPickerScope } from '../shared/ColumnPickerSlot'
import { exportWorkOrderList, getScheduledWorkOrders } from '../../lib/api-work-orders'
import { getPmPlans, getPmActivityTypes, exportPmPlans } from '../../lib/api-pm'
import { getEquipmentList } from '../../lib/api-equipment'
import { downloadBlobFile } from '../../lib/api'
import '../shared/ListTableChrome.css'
import PageBreadcrumbs from '../shared/PageBreadcrumbs'
import { useTableColumnPrefs } from '../../hooks/useTableColumnPrefs'
import { useCatalogFields } from '../../hooks/useCatalogFields'
import { mergePickerColumns } from '../../lib/pickerFields'
import { PM_PLAN_COLUMNS } from '../pm/pmPlanColumns'
import '../company/CompanyShared.css'
import '../shared/TableFilterToolbar.css'
import '../shared/TableColumnPicker.css'
import './WorkOrdersPage.css'
import '../pm/Pm.css'

function PmScheduledLayoutInner() {
  const { employee } = useProfile()
  const { locations } = useLocations()
  const { employees } = useEmployees({ limit: 200 })
  const { toolbarLeft, toolbarRight } = useWorkOrderToolbar()
  const { isOrgAdmin, locationId: scopedLocationId } = usePermissions()
  const [view, setView] = useState('plans')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [advancedRules, setAdvancedRules] = useState([createPmPlanFilterRule()])
  const [columnFilters, setColumnFilters] = useState({})
  const [headerSort, setHeaderSort] = useState(null)
  const [statusFilters, setStatusFilters] = useState([])
  const [exporting, setExporting] = useState(false)
  const [planRows, setPlanRows] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [assets, setAssets] = useState([])
  const [scheduledRows, setScheduledRows] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPmPlans({ limit: 200, offset: 0 }).catch(() => []),
      getPmActivityTypes().catch(() => []),
      getEquipmentList({ limit: 200, offset: 0 }).catch(() => []),
      getScheduledWorkOrders({ limit: 200, offset: 0 }).catch(() => []),
    ]).then(([plans, types, equipment, orders]) => {
      if (cancelled) return
      setPlanRows(Array.isArray(plans) ? plans : [])
      setActivityTypes(Array.isArray(types) ? types : [])
      setAssets(Array.isArray(equipment) ? equipment : [])
      setScheduledRows(Array.isArray(orders) ? orders : [])
    })
    return () => { cancelled = true }
  }, [])

  const isPlansView = view === 'plans'
  const catalogFields = useCatalogFields()
  const pmColumns = useMemo(
    () => mergePickerColumns(PM_PLAN_COLUMNS, catalogFields),
    [catalogFields],
  )
  const {
    visibleColumnIds: pmVisibleColumnIds,
    columnOrder: pmColumnOrder,
    toggleColumn: togglePmColumn,
    resetColumns: resetPmColumns,
    reorderColumns: reorderPmColumns,
    moveColumn: movePmColumn,
    saveColumns: savePmColumns,
    columnDefs: pmColumnDefs,
  } = useTableColumnPrefs('pm-plans', pmColumns)
  const sortOptions = isPlansView ? PM_PLAN_SORT_OPTIONS : WO_SORT_OPTIONS

  useEffect(() => {
    setColumnFilters({})
    setSortBy('newest')
    setAdvancedRules(isPlansView ? [createPmPlanFilterRule()] : [createFilterRule()])
  }, [view, isPlansView])

  const canSeeAllLocations = isOrgAdmin
  const userLocationId = scopedLocationId || employee?.location_id || null

  const activeLocations = useMemo(() => {
    const all = (locations || []).filter((loc) => loc.is_active !== false)
    if (canSeeAllLocations) return all
    if (!userLocationId) return []
    return all.filter((loc) => loc.id === userLocationId)
  }, [locations, canSeeAllLocations, userLocationId])

  const locationFilter = canSeeAllLocations ? 'all' : (userLocationId || 'all')
  const filterFields = isPlansView
    ? [
      {
        id: 'plan_number',
        label: 'Plan #',
        type: 'select',
        emptyLabel: 'All Plan #',
        options: uniqueNameOptions(planRows, (row) => row.plan_number),
      },
      {
        id: 'name',
        label: 'Name',
        type: 'select',
        emptyLabel: 'All names',
        options: uniqueNameOptions(planRows),
      },
      {
        id: 'activity',
        label: 'Activity',
        type: 'select',
        emptyLabel: 'All activities',
        options: uniqueNameOptions(activityTypes),
      },
      {
        id: 'status',
        label: 'Status',
        type: 'select',
        emptyLabel: 'All Status',
        options: PM_PLAN_STATUS_FILTER_OPTIONS,
      },
      {
        id: 'location',
        label: 'Location',
        type: 'select',
        emptyLabel: 'All Locations',
        options: activeLocations.map((loc) => ({ value: loc.name, label: loc.name })),
      },
      {
        id: 'equipment',
        label: 'Asset',
        type: 'select',
        emptyLabel: 'All assets',
        options: uniqueNameOptions(assets, (row) => row.name || row.code),
      },
      {
        id: 'technician',
        label: 'Technician',
        type: 'select',
        emptyLabel: 'All technicians',
        options: uniqueNameOptions(employees),
      },
    ]
    : [
      {
        id: 'wo_number',
        label: 'WO #',
        type: 'select',
        emptyLabel: 'All WO #',
        options: uniqueNameOptions(scheduledRows, (row) => row.wo_number),
      },
      {
        id: 'summary',
        label: 'Short description',
        type: 'select',
        emptyLabel: 'All descriptions',
        options: uniqueNameOptions(scheduledRows, (row) => row.short_description || row.summary),
      },
      {
        id: 'status',
        label: 'Status',
        type: 'select',
        emptyLabel: 'All Status',
        options: [
          { value: 'assigned', label: 'Assigned' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'verified', label: 'Verified' },
          { value: 'closed', label: 'Closed' },
        ],
      },
      {
        id: 'priority',
        label: 'Priority',
        type: 'select',
        emptyLabel: 'All Priorities',
        options: [
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ],
      },
      {
        id: 'location',
        label: 'Location',
        type: 'select',
        emptyLabel: 'All Locations',
        options: activeLocations.map((loc) => ({ value: loc.id, label: loc.name })),
      },
      {
        id: 'work_request',
        label: 'Work request',
        type: 'select',
        emptyLabel: 'All work requests',
        options: uniqueNameOptions(scheduledRows, (row) => row.work_request_number),
      },
      { id: 'created', label: 'Created', type: 'date-range', fromKey: 'created_from', toKey: 'created_to' },
    ]
  const outletContext = useMemo(() => ({
    view,
    setView,
    search,
    locationFilter,
    sortBy,
    advancedRules,
    fieldFilter: { field: '', value: '' },
    locations: activeLocations,
    pmVisibleColumnIds,
    columnFilters,
    setColumnFilter: (columnId, value) => {
      setColumnFilters((prev) => {
        const next = { ...prev }
        if (!String(value || '').trim()) delete next[columnId]
        else next[columnId] = value
        return next
      })
    },
    headerSort,
    setHeaderSort,
    statusFilters,
    toggleStatus: (key) => {
      setStatusFilters((prev) => (
        prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
      ))
    },
  }), [view, search, locationFilter, sortBy, advancedRules, activeLocations, pmVisibleColumnIds, columnFilters, headerSort, statusFilters])

  const exportRows = async () => {
    setExporting(true)
    try {
      const filters = { ...columnFilters }
      const file = isPlansView
        ? await exportPmPlans({ search, filters })
        : await exportWorkOrderList('/scheduled', {
          search,
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

  return (
    <ColumnPickerScope>
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
              placeholder: isPlansView ? 'Search PM plans...' : 'Search scheduled work orders...',
              ariaLabel: isPlansView ? 'Search PM plans' : 'Search scheduled work orders',
            }}
            filterSlot={(
              <AdvancedFilterMenu
                fields={filterFields}
                values={columnFilters}
                onChange={setColumnFilters}
              />
            )}
            sort={{ value: sortBy, onChange: (value) => { setSortBy(value); setHeaderSort(null) }, options: sortOptions }}
            actions={(
              <>
                <ExportCsvButton onClick={exportRows} busy={exporting} />
                {toolbarRight}
              </>
            )}
            columnPicker={isPlansView ? (
              <TableColumnPicker
                columnDefs={pmColumnDefs}
                visibleColumnIds={pmVisibleColumnIds}
                columnOrder={pmColumnOrder}
                onToggle={togglePmColumn}
                onReset={resetPmColumns}
                onReorder={reorderPmColumns}
                onMove={movePmColumn}
                onSave={savePmColumns}
              />
            ) : <ColumnPickerMount />}
          />
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

export default function PmScheduledRouteLayout() {
  return (
    <WorkOrderToolbarProvider>
      <PmScheduledLayoutInner />
    </WorkOrderToolbarProvider>
  )
}
