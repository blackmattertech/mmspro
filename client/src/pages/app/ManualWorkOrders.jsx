import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  getManualWorkOrders,
  getManualWorkOrder,
  deleteManualWorkOrder,
} from '../../lib/api-work-orders'
import { useWorkOrderList, listResponseCacheKey } from '../../hooks/useWorkOrderList'
import { invalidateListResponseCache } from '../../lib/listResponseCache'
import { usePermissions } from '../../hooks/usePermissions'
import { useOrg } from '../../hooks/useOrg'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import { buildServerListParams } from '../../lib/serverListParams'
import { orgPath } from '../../config/navigation'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'
import { useConfirmDelete } from '../../hooks/useConfirmDelete'
import { notifyTabCountsChanged } from '../../lib/tabCountEvents'

const MANUAL_COLUMNS = ['wo_number', 'summary', 'work_request', 'assignees', 'creator', 'created_at', 'status', 'priority', 'progress']

export default function ManualWorkOrders() {
  const { requestDelete, deleteModal } = useConfirmDelete()
  const location = useLocation()
  const navigate = useNavigate()
  const { org } = useOrg()
  const { canUpdate, canDelete } = usePermissions()
  const canEdit = canUpdate('work_orders_manual') || canUpdate('work_orders')
  const canRemove = canDelete('work_orders_manual') || canDelete('work_orders')
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const [actionError, setActionError] = useState(null)
  const {
    search, locationFilter, sortBy, advancedRules, fieldFilter, locations, bulkReloadToken = 0,
    columnFilters = {}, setColumnFilter, headerSort = null, setHeaderSort,
    statusFilters = [],
    reportFilterRows = null,
  } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${JSON.stringify(columnFilters)}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}|${headerSort?.id || ''}|${statusFilters.join(',')}|${bulkReloadToken}`,
  })
  const fetchManualOrders = useCallback(
    () => getManualWorkOrders(buildServerListParams({
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
    [debouncedSearch, pagination.pageSize, pagination.offset, bulkReloadToken, columnFilters, fieldFilter, statusFilters, headerSort, sortBy],
  )
  const listCacheKey = useMemo(() => listResponseCacheKey('wo-manual', {
    search: debouncedSearch,
    limit: pagination.pageSize,
    offset: pagination.offset,
    filters: columnFilters,
    field: fieldFilter?.field || '',
    value: fieldFilter?.value || '',
    statuses: statusFilters,
    sort: headerSort?.id || '',
    sortDir: headerSort?.dir || '',
    sort_by: headerSort ? '' : sortBy,
    bulk: bulkReloadToken,
  }), [debouncedSearch, pagination.pageSize, pagination.offset, columnFilters, fieldFilter, statusFilters, headerSort, sortBy, bulkReloadToken])
  const { orders, total, loading, error, reload } = useWorkOrderList(fetchManualOrders, {
    cacheKey: listCacheKey,
    onRows: reportFilterRows,
  })
  useEffect(() => { setListTotal(total) }, [total])
  useEffect(() => {
    if (bulkReloadToken) invalidateListResponseCache('wo-manual')
  }, [bulkReloadToken])
  const successMessage = location.state?.success

  const filteredOrders = useMemo(() => applyWorkOrderFilters(orders, {
    search: '',
    locationFilter,
    advancedRules,
    locations,
  }), [orders, locationFilter, advancedRules, locations])

  const handleEdit = useCallback((order) => {
    if (!org?.slug || !order?.id) return
    navigate(orgPath(org.slug, `work-orders/manual/${order.id}/edit`))
  }, [navigate, org?.slug])

  const handleDelete = useCallback(async (order) => {
    if (!order?.id) return
    const label = order.wo_number || 'this work order'
    if (!(await requestDelete({ title: 'Delete work order', message: `Permanently delete ${label}?` }))) return

    setActionError(null)
    try {
      await deleteManualWorkOrder(order.id)
      notifyTabCountsChanged('work_orders')
      if (selectedId === order.id) closeSelected()
      await reload({ silent: true })
    } catch (err) {
      setActionError(err.message)
    }
  }, [reload, selectedId, closeSelected, requestDelete])

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
        headerSort={headerSort}
        onHeaderSort={setHeaderSort}
        columnFilters={columnFilters}
        onColumnFilter={setColumnFilter}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getManualWorkOrder}
          onClose={closeSelected}
          onEdit={canEdit ? handleEdit : undefined}
          onAssignmentUpdated={() => reload({ silent: true })}
        />
      )}
      {deleteModal}
    </>
  )
}
