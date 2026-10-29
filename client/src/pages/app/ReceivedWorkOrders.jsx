import { useState, useCallback, useMemo, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getReceivedWorkOrders, getReceivedWorkOrder, updateWorkOrderLifecycle } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { usePermissions } from '../../hooks/usePermissions'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const RECEIVED_COLUMNS = ['wo_number', 'summary', 'work_request', 'assignees', 'creator', 'received_at', 'status', 'priority', 'progress']
const APPROVABLE_STATUSES = new Set(['assigned', 'returned_rework'])

export default function ReceivedWorkOrders() {
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const {
    search, locationFilter, sortBy, advancedRules, fieldFilter, locations,
    columnFilters = {}, setColumnFilter, headerSort = null, setHeaderSort,
    statusFilters = [], toggleStatus,
  } = useOutletContext()
  const { canUpdate, isOrgAdmin } = usePermissions()
  const canUpdateReceived = isOrgAdmin
    || canUpdate('work_orders_received')
    || canUpdate('work_orders')
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const listFilters = useMemo(() => {
    const next = { ...columnFilters }
    if (fieldFilter?.field && String(fieldFilter.value || '').trim()) next[fieldFilter.field] = fieldFilter.value
    return next
  }, [columnFilters, fieldFilter])
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${JSON.stringify(listFilters)}|${sortBy}|${headerSort?.id || ''}|${statusFilters.join(',')}`,
  })
  const fetchOrders = useCallback(
    () => getReceivedWorkOrders({
      search: debouncedSearch,
      limit: pagination.pageSize,
      offset: pagination.offset,
      filters: listFilters,
      statuses: statusFilters,
      excludeStatuses: statusFilters.length ? [] : ['draft'],
      sort: headerSort?.id || '',
      sortDir: headerSort?.dir || '',
      sort_by: headerSort ? '' : sortBy,
    }),
    [debouncedSearch, pagination.pageSize, pagination.offset, listFilters, statusFilters, headerSort, sortBy],
  )
  const { orders, total, statusCounts, loading, error, reload } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  const filtered = useMemo(
    () => applyWorkOrderFilters(orders, { search: '', locationFilter, advancedRules, locations }),
    [orders, locationFilter, advancedRules, locations],
  )

  const canApproveOrder = useCallback((order) => (
    canUpdateReceived
    && APPROVABLE_STATUSES.has(order.status)
    && !order.skip_technician_acceptance
  ), [canUpdateReceived])

  const handleApprove = useCallback(async (order) => {
    setApprovingId(order.id)
    setActionError(null)
    try {
      await updateWorkOrderLifecycle(order.id, { status: 'accepted' })
      await reload({ silent: true })
    } catch (err) {
      setActionError(err.message || 'Could not approve this work order.')
    } finally {
      setApprovingId(null)
    }
  }, [reload])

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {(error || actionError) && (
        <div className="wo-alert wo-alert--error" role="alert">{actionError || error}</div>
      )}

      <WorkOrdersTable
        orders={filtered}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={RECEIVED_COLUMNS}
        tableId="work-orders-received"
        statusCounts={statusCounts}
        emptyTitle="No work orders received yet."
        emptyHint="Incoming work assigned to you, your department, or your location appears here. Work you requested or assigned out is under Assigned."
        onView={setSelectedId}
        onApprove={handleApprove}
        canApproveOrder={canApproveOrder}
        approvingId={approvingId}
        paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
        headerSort={headerSort}
        onHeaderSort={setHeaderSort}
        columnFilters={columnFilters}
        onColumnFilter={setColumnFilter}
        statusFilters={statusFilters}
        onToggleStatus={toggleStatus}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={getReceivedWorkOrder}
          onClose={closeSelected}
        />
      )}
    </>
  )
}
