import { useState, useCallback, useMemo, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { getUnassignedWorkOrders, getUnassignedWorkOrder, getWorkOrderDetail } from '../../lib/api-work-orders'
import { useWorkOrderList, listResponseCacheKey } from '../../hooks/useWorkOrderList'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useTablePagination } from '../../hooks/useTablePagination'
import { useOpenQueryId } from '../../hooks/useOpenQueryId'
import { applyWorkOrderFilters } from '../../lib/workOrderFilters'
import ReceivedWorkOrderDetailModal from '../../components/workorders/ReceivedWorkOrderDetailModal'
import WorkOrdersTable from '../../components/workorders/WorkOrdersTable'
import '../../components/company/CompanyShared.css'
import '../../components/workorders/WorkOrdersPage.css'

const UNASSIGNED_COLUMNS = ['wo_number', 'summary', 'work_request', 'assignees', 'creator', 'received_at', 'status', 'priority', 'progress']

export default function UnassignedWorkOrders() {
  const [selectedId, setSelectedId, closeSelected] = useOpenQueryId()
  const {
    search, locationFilter, sortBy, advancedRules, fieldFilter, locations,
    columnFilters = {}, setColumnFilter, headerSort = null, setHeaderSort,
    statusFilters = [],
    reportFilterRows = null,
    reportStatusCounts = null,
  } = useOutletContext()
  const debouncedSearch = useDebouncedValue(search)
  const [listTotal, setListTotal] = useState(0)
  const listFilters = useMemo(() => {
    const next = { ...columnFilters }
    if (fieldFilter?.field && String(fieldFilter.value || '').trim()) next[fieldFilter.field] = fieldFilter.value
    return next
  }, [columnFilters, fieldFilter])
  const pagination = useTablePagination(listTotal, {
    resetKey: `${debouncedSearch}|${locationFilter}|${JSON.stringify(listFilters)}|${sortBy}|${headerSort?.id || ''}|${statusFilters.join(',')}`,
  })
  const fetchOrders = useCallback(
    () => getUnassignedWorkOrders({
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
  const listCacheKey = useMemo(() => listResponseCacheKey('wo-unassigned', {
    search: debouncedSearch,
    limit: pagination.pageSize,
    offset: pagination.offset,
    filters: listFilters,
    statuses: statusFilters,
    sort: headerSort?.id || '',
    sortDir: headerSort?.dir || '',
    sort_by: headerSort ? '' : sortBy,
  }), [debouncedSearch, pagination.pageSize, pagination.offset, listFilters, statusFilters, headerSort, sortBy])
  const { orders, total, statusCounts, loading, error, reload } = useWorkOrderList(fetchOrders, {
    cacheKey: listCacheKey,
    onRows: reportFilterRows,
  })
  useEffect(() => { setListTotal(total) }, [total])
  useEffect(() => { reportStatusCounts?.(statusCounts) }, [statusCounts, reportStatusCounts])

  const filtered = useMemo(
    () => applyWorkOrderFilters(orders, { search: '', locationFilter, advancedRules, locations }),
    [orders, locationFilter, advancedRules, locations],
  )

  if (loading) {
    return <div className="company-loading">Loading...</div>
  }

  return (
    <>
      {error && <div className="wo-alert wo-alert--error" role="alert">{error}</div>}

      <WorkOrdersTable
        orders={filtered}
        totalCount={total}
        pagination={pagination}
        serverPaged
        columns={UNASSIGNED_COLUMNS}
        tableId="work-orders-unassigned"
        emptyTitle="No unassigned work orders."
        emptyHint="Order To work for your department with no technician assigned appears here."
        onView={setSelectedId}
        paginationResetKey={`${search}|${locationFilter}|${fieldFilter?.field}|${fieldFilter?.value}|${sortBy}`}
        headerSort={headerSort}
        onHeaderSort={setHeaderSort}
        columnFilters={columnFilters}
        onColumnFilter={setColumnFilter}
      />

      {selectedId && (
        <ReceivedWorkOrderDetailModal
          orderId={selectedId}
          fetchWorkOrder={(id) => getWorkOrderDetail(id, { prefer: getUnassignedWorkOrder })}
          onClose={closeSelected}
          onAssignmentUpdated={() => reload({ silent: true })}
        />
      )}
    </>
  )
}
