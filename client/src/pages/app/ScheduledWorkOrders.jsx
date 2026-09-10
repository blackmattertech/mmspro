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
  generatePmWorkOrder,
} from '../../lib/api-pm'
import { formatScheduleSummary, pmPlanStatusLabel } from '../../config/pm'
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
import EditIcon from '../../components/ui/EditIcon'
import TrashIcon from '../../components/ui/TrashIcon'
import PmPlanModal from '../../components/pm/PmPlanModal'
import PmActivityTypesModal from '../../components/pm/PmActivityTypesModal'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'
import '../../components/pm/Pm.css'

const SCHEDULED_COLUMNS = ['wo_number', 'summary', 'scheduled_at', 'assignees', 'status']

function formatDate(value) {
  if (!value) return '—'
  return String(value).slice(0, 10)
}

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
  const { orders, total, loading, error: ordersError } = useWorkOrderList(fetchOrders)
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
          <button type="button" className="company-btn company-btn--primary" onClick={() => setPlanModal({})}>
            + PM Plan
          </button>
        )}
      </>
    )
    setToolbar(null, actions)
    return () => clearToolbar()
  }, [view, canAdd, setToolbar, clearToolbar])

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
          <div className="company-table-wrap">
            <table className="company-table">
              <thead>
                <tr>
                  <th>Plan #</th>
                  <th>Name</th>
                  <th>Activity</th>
                  <th>Asset</th>
                  <th>Schedule</th>
                  <th>Next due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.plan_number || '—'}</td>
                    <td><span className="company-table__name">{plan.name}</span></td>
                    <td>{plan.activity_type?.name || '—'}</td>
                    <td>{plan.equipment?.name || '—'}</td>
                    <td>{formatScheduleSummary(plan)}</td>
                    <td>{formatDate(plan.next_due_at)}</td>
                    <td>
                      <span className={`pm-status pm-status--${plan.status}`}>{pmPlanStatusLabel(plan.status)}</span>
                    </td>
                    <td>
                      <div className="pm-table-actions">
                        {canAdd && (plan.status === 'active' || plan.status === 'overdue') && (
                          <button
                            type="button"
                            className="company-btn company-btn--secondary company-btn--compact"
                            onClick={() => handleGenerate(plan)}
                          >
                            Generate
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" className="company-btn company-btn--secondary company-btn--compact company-btn--icon" onClick={() => setPlanModal(plan)} aria-label="Edit plan">
                            <EditIcon />
                          </button>
                        )}
                        {canRemove && (
                          <button type="button" className="company-btn company-btn--secondary company-btn--compact company-btn--icon" onClick={() => handleDeletePlan(plan)} aria-label="Delete plan">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredPlans.length && (
                  <tr>
                    <td colSpan={8}>
                      <div className="company-empty">
                        <strong>{plans.length ? 'No matching PM plans.' : 'No PM plans yet.'}</strong>
                        <p>
                          {plans.length
                            ? 'Try a different search or clear the filters.'
                            : 'Create a planned maintenance plan to generate scheduled work orders automatically.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
