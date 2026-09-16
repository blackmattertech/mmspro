import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  getScheduledWorkOrders,
  getScheduledWorkOrder,
} from '../../lib/api-work-orders'
import {
  getPmPlans,
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
import { applyPmPlanFilters } from '../../lib/pmPlanFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import PmPlanModal from '../../components/pm/PmPlanModal'
import PmPlansTable from '../../components/pm/PmPlansTable'
import PmActivityTypesModal from '../../components/pm/PmActivityTypesModal'
import {
  useMasterBulkUpload,
  MasterBulkActions,
} from '../../components/company/MasterBulkUpload'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/pm/Pm.css'

const SCHEDULED_COLUMNS = ['wo_number', 'summary', 'scheduled_at', 'assignees', 'status', 'progress']

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
  } = outlet
  const { setToolbar, clearToolbar } = useWorkOrderToolbar()
  const { canCreate, canUpdate, canDelete } = usePermissions()
  const canAdd = canCreate('work_orders_scheduled') || canCreate('work_orders')
  const canEdit = canUpdate('work_orders_scheduled') || canUpdate('work_orders')
  const canRemove = canDelete('work_orders_scheduled') || canDelete('work_orders')

  const [plans, setPlans] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [planModal, setPlanModal] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)
  const [showActivityTypes, setShowActivityTypes] = useState(false)
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()

  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`,
  })

  const fetchOrders = useCallback(
    () => getScheduledWorkOrders({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [debouncedSearch, pagination.pageSize, pagination.offset],
  )
  const { orders, total, statusCounts, loading, error: ordersError } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  const loadPlans = useCallback(async () => {
    const rows = await getPmPlans({ search: debouncedSearch, limit: 200 })
    setPlans(rows)
  }, [debouncedSearch])

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

  useEffect(() => {
    reloadMeta()
  }, [reloadMeta])

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
            onDownload={handleDownloadTemplate}
            bulkBusy={bulkBusy}
            bulkInputRef={bulkInputRef}
            onFileChange={handleBulkFile}
            addLabel="+ PM Plan"
            onAdd={() => setPlanModal({})}
            title="Bulk upload PM plans"
            noun="PM plan"
            bulkError={bulkError}
            bulkResult={bulkResult}
          />
        )}
      </>
    )
    setToolbar(null, actions)
    return () => clearToolbar()
  }, [view, canAdd, setToolbar, clearToolbar, bulkBusy, bulkError, bulkResult, handleDownloadTemplate, handleBulkFile])

  const filteredOrders = useMemo(
    () => applyWorkOrderFilters(orders, { search: '', locationFilter, sortBy, advancedRules, fieldFilter, locations }),
    [orders, locationFilter, sortBy, advancedRules, fieldFilter, locations],
  )

  const filteredPlans = useMemo(
    () => applyPmPlanFilters(plans, {
      search,
      locationFilter,
      sortBy,
      advancedRules,
      fieldFilter,
      locations,
    }),
    [plans, search, locationFilter, sortBy, advancedRules, fieldFilter, locations],
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
          plan={planModal.id ? planModal : null}
          saving={saving}
          onClose={() => setPlanModal(null)}
          onSave={handleSavePlan}
        />
      )}

      {showActivityTypes && (
        <PmActivityTypesModal onClose={() => setShowActivityTypes(false)} />
      )}
    </>
  )
}
