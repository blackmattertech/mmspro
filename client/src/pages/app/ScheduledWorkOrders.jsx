import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import {
  getScheduledWorkOrders,
  getScheduledWorkOrder,
} from '../../lib/api-work-orders'
import {
  getPmPlan,
  getPmPlans,
  getPmTabCounts,
  createPmPlan,
  updatePmPlan,
  deletePmPlan,
  duplicatePmPlan,
  generatePmWorkOrder,
  getPmPlansTemplate,
  bulkUploadPmPlans,
} from '../../lib/api-pm'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { useWorkOrderToolbar } from '../../hooks/useWorkOrderToolbar'
import { usePermissions } from '../../hooks/usePermissions'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import { buildServerListParams } from '../../lib/serverListParams'
import { applyPmPlanFilters } from '../../lib/pmPlanFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import { getEquipment } from '../../lib/api-equipment'
import PmPlansTable from '../../components/pm/PmPlansTable'
import PmPlanModal from '../../components/pm/PmPlanModal'
import PmActivityTypesModal from '../../components/pm/PmActivityTypesModal'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../../components/company/MasterBulkUpload'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/pm/Pm.css'

const SCHEDULED_COLUMNS = ['wo_number', 'summary', 'work_request', 'scheduled_at', 'assignees', 'status', 'priority', 'progress']

export default function ScheduledWorkOrders() {
  const outlet = useOutletContext() || {}
  const {
    view = 'plans',
    setView,
    search = '',
    locationFilter = 'all',
    sortBy = 'newest',
    advancedRules = [],
    fieldFilter = { field: '', value: '' },
    locations = [],
    pmVisibleColumnIds,
    columnFilters = {},
    setColumnFilter,
    headerSort = null,
    setHeaderSort,
    statusFilters = [],
    toggleStatus,
  } = outlet
  const { setToolbar, clearToolbar } = useWorkOrderToolbar()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canAdd = canCreate('work_orders_scheduled') || canCreate('work_orders')
  const canEdit = canUpdate('work_orders_scheduled') || canUpdate('work_orders')
  const canRemove = canDelete('work_orders_scheduled') || canDelete('work_orders')

  const [plans, setPlans] = useState([])
  const [tabCounts, setTabCounts] = useState({ plans: 0, orders: 0 })
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [planModal, setPlanModal] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)
  const [showActivityTypes, setShowActivityTypes] = useState(false)
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const [params, setParams] = useSearchParams()
  const planId = params.get('plan')

  useEffect(() => {
    if (params.get('create') !== '1') return undefined
    setView?.('plans')
    setPlanModal({})
    const next = new URLSearchParams(params)
    next.delete('create')
    setParams(next, { replace: true })
    return undefined
  }, [params, setParams, setView])

  useEffect(() => {
    const equipmentId = params.get('equipment_id')
    if (!equipmentId) return undefined
    let cancelled = false
    getEquipment(equipmentId)
      .then((row) => {
        if (cancelled || !row) return
        setView?.('plans')
        setPlanModal({
          equipment_id: row.id,
          location_id: row.location_id || '',
          department_id: row.department_id || '',
          area_id: row.area_id || '',
        })
        const next = new URLSearchParams(params)
        next.delete('equipment_id')
        setParams(next, { replace: true })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [params, setParams, setView])

  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`,
  })

  const fetchOrders = useCallback(
    () => getScheduledWorkOrders(buildServerListParams({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
      columnFilters,
      fieldFilter,
      statusFilters,
      headerSort,
      sortBy,
      excludeDraft: true,
    })),
    [debouncedSearch, pagination.pageSize, pagination.offset, columnFilters, fieldFilter, statusFilters, headerSort, sortBy],
  )
  const { orders, total, statusCounts, loading, error: ordersError } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  const loadPlans = useCallback(async () => {
    const field = fieldFilter?.field
    const value = String(fieldFilter?.value || '').trim()
    const rows = await getPmPlans({
      search: debouncedSearch,
      limit: 200,
      filters: field && value ? { [field]: value } : undefined,
    })
    setPlans(rows)
  }, [debouncedSearch, fieldFilter])

  useEffect(() => {
    if (!planId && selectedId) setView?.('orders')
  }, [planId, selectedId, setView])

  useEffect(() => {
    if (!planId) return undefined
    let cancelled = false
    setView?.('plans')
    getPmPlan(planId)
      .then((plan) => {
        if (!cancelled && plan) setPlanModal(plan)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => { cancelled = true }
  }, [planId, setView])

  const closePlanModal = () => {
    setPlanModal(null)
    if (!params.has('plan')) return
    const next = new URLSearchParams(params)
    next.delete('plan')
    setParams(next, { replace: true })
  }

  const reloadMeta = useCallback(async () => {
    setLoadingMeta(true)
    setError(null)
    try {
      await loadPlans()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMeta(false)
    }
  }, [loadPlans])

  const {
    bulkInputRef,
    bulkBusy,
    bulkError,
    bulkResult,
    handleDownloadTemplate,
    handleBulkFile,
  } = useMasterBulkUpload({
    downloadTemplate: getPmPlansTemplate,
    upload: bulkUploadPmPlans,
    onSuccess: () => loadPlans(),
    defaultFilename: 'pm-plans-template.xlsx',
  })
  const bulkActionsRef = useRef({ handleDownloadTemplate, handleBulkFile })
  bulkActionsRef.current = { handleDownloadTemplate, handleBulkFile }

  useEffect(() => {
    reloadMeta()
  }, [reloadMeta])

  useEffect(() => {
    let cancelled = false
    getPmTabCounts()
      .then((counts) => { if (!cancelled && counts) setTabCounts(counts) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [view, plans.length])

  useEffect(() => {
    const actions = (
      <>
        {view === 'plans' && (
          <button type="button" className="company-btn company-btn--secondary" onClick={() => setShowActivityTypes(true)}>
            Activity types
          </button>
        )}
        {canAdd && view === 'plans' && (
          <MasterBulkActions
            onDownload={() => bulkActionsRef.current.handleDownloadTemplate()}
            bulkBusy={bulkBusy}
            bulkInputRef={bulkInputRef}
            onFileChange={(event) => bulkActionsRef.current.handleBulkFile(event)}
            addLabel="+ PM Plan"
            onAdd={() => setPlanModal({})}
            title="Import PM plans"
            noun="PM plan"
            bulkError={bulkError}
            bulkResult={bulkResult}
          />
        )}
      </>
    )
    setToolbar(null, actions)
    return () => clearToolbar()
  }, [view, canAdd, setToolbar, clearToolbar, bulkBusy, bulkError, bulkResult])

  const filteredOrders = useMemo(
    () => applyWorkOrderFilters(orders, { search: '', locationFilter, advancedRules, locations }),
    [orders, locationFilter, sortBy, advancedRules, fieldFilter, locations],
  )

  const filteredPlans = useMemo(
    () => applyPmPlanFilters(plans, {
      search,
      locationFilter,
      sortBy,
      advancedRules,
      locations,
    }),
    [plans, search, locationFilter, sortBy, advancedRules, locations],
  )

  const handleSavePlan = async (payload) => {
    setSaving(true)
    try {
      if (planModal?.id) await updatePmPlan(planModal.id, payload)
      else await createPmPlan(payload)
      setPlanModal(null)
      await loadPlans()
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async (plan) => {
    setError(null)
    try {
      await generatePmWorkOrder(plan.id)
      await loadPlans()
      setView('orders')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeletePlan = async (plan) => {
    setError(null)
    try {
      await deletePmPlan(plan.id)
      await loadPlans()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDuplicatePlan = async (plan) => {
    setError(null)
    setDuplicatingId(plan.id)
    try {
      await duplicatePmPlan(plan.id)
      await loadPlans()
    } catch (err) {
      setError(err.message)
    } finally {
      setDuplicatingId(null)
    }
  }

  return (
    <>
      <div className="pm-subtabs" role="tablist" aria-label="Scheduled maintenance">
        {[
          { id: 'plans', label: 'PM Plans' },
          { id: 'orders', label: 'Scheduled work orders' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            className={`pm-subtabs__btn${view === tab.id ? ' pm-subtabs__btn--active' : ''}`}
            onClick={() => setView?.(tab.id)}
          >
            {tab.label}
            <span className="wo-page__tab-count">{tabCounts[tab.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {(error || ordersError) && (
        <div className="wo-alert wo-alert--error" role="alert">{error || ordersError}</div>
      )}

      {view === 'plans' && (
        loadingMeta ? (
          <div className="company-loading">Loading...</div>
        ) : (
          <PmPlansTable
            plans={filteredPlans}
            totalCount={plans.length}
            visibleColumnIds={pmVisibleColumnIds}
            canAdd={canAdd}
            canEdit={canEdit}
            canRemove={canRemove}
            duplicatingId={duplicatingId}
            onGenerate={handleGenerate}
            onDuplicate={handleDuplicatePlan}
            onEdit={setPlanModal}
            onDelete={handleDeletePlan}
          />
        )
      )}

      {view === 'orders' && (
        loading ? (
          <div className="company-loading">Loading...</div>
        ) : (
          <WorkOrdersTable
            orders={filteredOrders}
            totalCount={total}
            pagination={pagination}
            serverPaged
            columns={SCHEDULED_COLUMNS}
            tableId="work-orders-scheduled"
            statusCounts={statusCounts}
            emptyTitle="No scheduled work orders yet."
            emptyHint="Activate a PM plan and the scheduler will generate work orders before each due date. You can also click Generate on a plan."
            onView={setSelectedId}
            paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
            headerSort={headerSort}
            onHeaderSort={setHeaderSort}
            columnFilters={columnFilters}
            onColumnFilter={setColumnFilter}
            statusFilters={statusFilters}
            onToggleStatus={toggleStatus}
          />
        )
      )}

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getScheduledWorkOrder}
          onClose={closeSelected}
        />
      )}

      {planModal && (
        <PmPlanModal
          plan={planModal.id || planModal.equipment_id ? planModal : null}
          saving={saving}
          onClose={closePlanModal}
          onSave={handleSavePlan}
        />
      )}

      {showActivityTypes && (
        <PmActivityTypesModal onClose={() => setShowActivityTypes(false)} />
      )}
    </>
  )
}
