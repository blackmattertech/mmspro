import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  getManualWorkOrders,
  getManualWorkOrder,
  deleteManualWorkOrder,
} from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrg } from '../../hooks/useOrg'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import { orgPath } from '../../config/navigation'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const MANUAL_COLUMNS = ['wo_number', 'summary', 'assignees', 'creator', 'created_at', 'status']

export default function ManualWorkOrders() {
  const location = useLocation()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canUpdate, canDelete } = usePermissions()
  const canEdit = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canRemove = canDelete('work_orders_manual') || canDelete('work_orders')
  const [selectedId, setSelectedId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const { search, locationFilter, sortBy, advancedRules, fieldFilter, locations } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`,
  })
  const fetchManualOrders = useCallback(
    () => getManualWorkOrders({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
    }),
    [debouncedSearch, pagination.pageSize, pagination.offset],
  )
  const { orders, total, loading, error, reload } = useWorkOrderList(fetchManualOrders)
  useEffect(() => { setListTotal(total) }, [total])
  const successMessage = location.state?.success

  const filteredOrders = useMemo(() => applyWorkOrderFilters(orders, {
    search: '',
    locationFilter,
    sortBy,
    advancedRules,
    fieldFilter,
    locations,
  }), [orders, locationFilter, sortBy, advancedRules, fieldFilter, locations])

  const handleEdit = useCallback((order) => {
    if (!org?.slug || !order?.id) return
    navigate(orgPath(org.slug, `work-orders/manual/${order.id}/edit`))
  }, [navigate, org?.slug])

  const handleDelete = useCallback(async (order) => {
    if (!order?.id) return
    const label = order.wo_number || 'this work order'
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return

    setActionError(null)
    try {
      await deleteManualWorkOrder(order.id)
      if (selectedId === order.id) setSelectedId(null)
      await reload({ silent: true })
    } catch (err) {
      setActionError(err.message)
    }
  }, [reload, selectedId])

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {successMessage && (
        <div className="wo-alert wo-alert--success" role="status">{successMessage}</div>
      )}
      {(error || actionError) && (
        <div className="wo-alert wo-alert--error" role="alert">{actionError || error}</div>
      )}

      <p className="wo-page__result-count">
        {total} work order{total === 1 ? '' : 's'}
      </p>

      <WorkOrdersTable
        orders={filteredOrders}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={MANUAL_COLUMNS}
        tableId="work-orders-manual"
        emptyTitle="No manual work orders yet."
        emptyHint="Click + Add Work Order to create a manual work order."
        onView={setSelectedId}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canEdit={canEdit}
        canDelete={canRemove}
        paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getManualWorkOrder}
          onClose={() => setSelectedId(null)}
          onEdit={canEdit ? handleEdit : undefined}
        />
      )}
    </>
  )
}
