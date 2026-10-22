import { useState, useCallback, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getAssignedWorkOrders, getAssignedWorkOrder } from '../../lib/api-work-orders'
import { useWorkOrderList } from '../../hooks/useWorkOrderList'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import { buildServerListParams } from '../../lib/serverListParams'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const ASSIGNED_COLUMNS = ['wo_number', 'summary', 'work_request', 'assignees', 'created_at', 'status', 'priority', 'progress']

export default function AssignedWorkOrders() {
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const {
    search, locationFilter, sortBy, advancedRules, fieldFilter, locations,
    columnFilters = {}, setColumnFilter, headerSort = null, setHeaderSort,
    statusFilters = [], toggleStatus,
  } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const listFilters = useMemo(() => buildServerListParams({
    columnFilters, fieldFilter, statusFilters, headerSort, sortBy, excludeDraft: true,
  }).filters, [columnFilters, fieldFilter, statusFilters, headerSort, sortBy])
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${JSON.stringify(listFilters)}|${sortBy}|${headerSort?.id || ''}|${statusFilters.join(',')}`,
  })
  const fetchOrders = useCallback(
    () => getAssignedWorkOrders(buildServerListParams({
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
  const { orders, total, statusCounts, loading, error } = useWorkOrderList(fetchOrders)
  useEffect(() => { setListTotal(total) }, [total])

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  const filtered = applyWorkOrderFilters(orders, { search: '', locationFilter, advancedRules, locations })

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <WorkOrdersTable
        orders={filtered}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={ASSIGNED_COLUMNS}
        tableId="work-orders-assigned"
        statusCounts={statusCounts}
        emptyTitle="No work orders assigned yet."
        emptyHint="Work orders you requested or created and assigned to someone else appear here."
        onView={setSelectedId}
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
          fetchWorkOrder={getAssignedWorkOrder}
          onClose={closeSelected}
        />
      )}
    </>
  )
}
